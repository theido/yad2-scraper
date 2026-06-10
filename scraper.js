// Load environment variables from .env file
require('dotenv').config();

const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');
const { extractListingsFromHtml } = require('./scraper-lib');

const getYad2Response = async (url) => {
    const requestOptions = {
        method: 'GET',
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        }
    };
    try {
        const res = await fetch(url, requestOptions)
        return await res.text()
    } catch (err) {
        console.log(err)
    }
}

const scrapeItemsAndExtractDetails = async (url) => {
    const yad2Html = await getYad2Response(url);
    if (!yad2Html) {
        throw new Error("Could not get Yad2 response");
    }

    const listings = extractListingsFromHtml(yad2Html, url);
    console.log(`Extracted ${listings.length} listings with details`);
    return listings;
}

const checkIfHasNewItems = async (carListings, topic) => {
    const filePath = `./data/${topic}.json`;
    let savedListings = [];
    try {
        savedListings = require(filePath);
    } catch (e) {
        if (e.code === "MODULE_NOT_FOUND") {
            // Create data directory if it doesn't exist
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }
            fs.writeFileSync(filePath, '[]');
        } else {
            console.log(e);
            throw new Error(`Could not read / create ${filePath}`);
        }
    }

    // Get existing car IDs
    const savedIds = savedListings.map(car => car.id);

    // Find new listings
    const newItems = [];
    const allListings = [...savedListings];

    carListings.forEach(car => {
        if (!savedIds.includes(car.id)) {
            allListings.push(car);
            newItems.push(car);
        }
    });

    // Update the saved file with all listings
    if (newItems.length > 0 || allListings.length !== savedListings.length) {
        const updatedListings = JSON.stringify(allListings, null, 2);
        fs.writeFileSync(filePath, updatedListings);
        await createPushFlagForWorkflow();
    }

    return newItems;
}

const createPushFlagForWorkflow = () => {
    fs.writeFileSync("push_me", "")
}

const scrape = async (topic, url) => {
    const apiToken = process.env.API_TOKEN || config.telegramApiToken;
    const chatId = process.env.CHAT_ID || config.chatId;
    const telenode = new Telenode({ apiToken })
    try {
        console.log(`Starting scanning ${topic} on link: ${url}`);
        await telenode.sendTextMessage(`🔍 Starting scan for ${topic}...`, chatId)

        // Add a small delay to be respectful to the server
        await new Promise(resolve => setTimeout(resolve, 2000));

        const carListings = await scrapeItemsAndExtractDetails(url);
        const newItems = await checkIfHasNewItems(carListings, topic);

        if (newItems.length > 0) {
            console.log(`Found ${newItems.length} new car listings for ${topic}`);

            // Send a summary message first
            await telenode.sendTextMessage(
                `🚗 Found ${newItems.length} new ${topic} listings!\n\n` +
                `Total listings found: ${carListings.length}\n\n` +
                `🔍 Search URL: ${url}`,
                chatId
            );

            // Send detailed messages for each new car (limit to 5 to avoid spam)
            const itemsToSend = newItems.slice(0, 5);
            for (const car of itemsToSend) {
                const message = formatCarMessage(car);
                await telenode.sendTextMessage(message, chatId);
                // Small delay between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (newItems.length > 5) {
                await telenode.sendTextMessage(
                    `... and ${newItems.length - 5} more listings! Check the full list on Yad2.`,
                    chatId
                );
            }
        } else {
            console.log(`No new items found for ${topic}`);
            await telenode.sendTextMessage(
                `✅ No new ${topic} listings found.\nTotal listings: ${carListings.length}\n\n🔍 Search URL: ${url}`,
                chatId
            );
        }
    } catch (e) {
        let errMsg = e?.message || "";
        if (errMsg) {
            errMsg = `Error: ${errMsg}`
        }
        console.error(`Error scanning ${topic}:`, errMsg);
        await telenode.sendTextMessage(`❌ Scan failed for ${topic}:\n${errMsg}\n\n🔍 Search URL: ${url}`, chatId)
        throw new Error(e)
    }
}

const formatCarMessage = (car) => {
    let message = `🚗 *${car.title}*\n`;

    if (car.price) {
        message += `💰 Price: ${car.price}\n`;
    }

    if (car.year && car.hand) {
        message += `📅 ${car.year} • ${car.hand}\n`;
    }

    if (car.agency) {
        message += `🏢 ${car.agency}\n`;
    }

    message += `🔗 [View Listing](${car.link})`;

    return message;
}

const program = async () => {
    // Check if we have GitHub Variables for multiple projects
    const envProjects = process.env.SCRAPER_PROJECTS;

    if (envProjects) {
        try {
            console.log('Using GitHub Variables for configuration');
            const projects = JSON.parse(envProjects);

            if (Array.isArray(projects) && projects.length > 0) {
                await Promise.all(projects.filter(project => {
                    if (project.disabled) {
                        console.log(`Topic "${project.topic}" is disabled. Skipping.`);
                    }
                    return !project.disabled;
                }).map(async project => {
                    await scrape(project.topic, project.url);
                }));
                return;
            }
        } catch (error) {
            console.error('Error parsing SCRAPER_PROJECTS:', error.message);
            console.log('Falling back to individual variables or config.json');
        }
    }

    // Check if we have individual environment variables for single project
    const envTopic = process.env.SCRAPER_TOPIC;
    const envUrl = process.env.SCRAPER_URL;

    if (envTopic && envUrl) {
        console.log('Using individual environment variables for configuration');
        await scrape(envTopic, envUrl);
        return;
    }

    // Fall back to config.json for multiple projects
    console.log('Using config.json for configuration');
    await Promise.all(config.projects.filter(project => {
        if (project.disabled) {
            console.log(`Topic "${project.topic}" is disabled. Skipping.`);
        }
        return !project.disabled;
    }).map(async project => {
        await scrape(project.topic, project.url)
    }))
};

program();
