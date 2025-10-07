// Load environment variables from .env file
require('dotenv').config();

const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');

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
    const $ = cheerio.load(yad2Html);
    const title = $("title")
    const titleText = title.first().text();
    if (titleText === "ShieldSquare Captcha") {
        throw new Error("Bot detection");
    }
    
    // Find all car listing links - be more precise
    let $carLinks = $('a[href*="/item/"]');
    
    // Also look for links that start with item/ (without leading slash)
    const $carLinksNoSlash = $('a[href*="item/"]').filter((i, el) => {
        const href = $(el).attr('href');
        return href && href.startsWith('item/');
    });
    
    // Combine both sets
    $carLinks = $carLinks.add($carLinksNoSlash);
    
    console.log(`Found ${$carLinks.length} car listing links`);
    
    // If we still don't find enough, try looking in specific containers
    if ($carLinks.length < 15) {
        console.log(`Found only ${$carLinks.length} car links, checking containers...`);
        
        // Look for links in car-related containers
        const $containers = $('[data-testid*="item"], .promotion-layout_container___TZ9j, .promotion-layout-no-footer_container__zrTOu, .ultra-plus_box__rGgJn, .agency-item-no-footer_box__0Ss8o');
        console.log(`Found ${$containers.length} potential containers`);
        
        const $containerLinks = $containers.find('a').filter((i, el) => {
            const href = $(el).attr('href');
            return href && (href.includes('/item/') || href.startsWith('item/'));
        });
        
        console.log(`Found ${$containerLinks.length} car links in containers`);
        
        if ($containerLinks.length > $carLinks.length) {
            $carLinks = $containerLinks;
        }
    }
    
    if (!$carLinks || $carLinks.length === 0) {
        throw new Error("Could not find car listings");
    }
    
    console.log(`Found ${$carLinks.length} car listings on the page`);
    
    const carListings = []
    const processedIds = new Set(); // To avoid duplicates
    
    $carLinks.each((_, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        
        // Skip if not a valid car listing link
        if (!href || !href.includes('item')) return;
        
        // Extract car ID
        const carId = href.split('/item/')[1]?.split('?')[0] || href.split('item/')[1]?.split('?')[0] || 'unknown';
        
        // Skip if we already processed this car
        if (processedIds.has(carId)) return;
        processedIds.add(carId);
        
        // Extract car details
        const carDetails = {
            id: carId,
            link: href.startsWith('http') ? href : `https://www.yad2.co.il/vehicles${href}`,
            title: '',
            price: '',
            year: '',
            hand: '',
            location: '',
            image: '',
            agency: ''
        };
        
        // Try multiple selectors for title
        let titleElement = $link.find('[data-nagish="feed-item-section-title"]');
        if (!titleElement.length) {
            titleElement = $link.find('h2, .feed-item-info-section_heading__Bp32t');
        }
        if (titleElement.length) {
            carDetails.title = titleElement.text().trim();
        }
        
        // Try multiple selectors for price
        let priceElement = $link.find('[data-testid="price"]');
        if (!priceElement.length) {
            priceElement = $link.find('.price_price__xQt90, .feed-item-left-side-section_priceBox__PvCVc');
        }
        if (priceElement.length) {
            carDetails.price = priceElement.text().trim();
        }
        
        // Try multiple selectors for year and hand
        let yearHandElement = $link.find('.feed-item-info-section_yearAndHandBox__H5oQ0 span');
        if (!yearHandElement.length) {
            yearHandElement = $link.find('.feed-item-info-section_yearAndHandBox__H5oQ0');
        }
        if (yearHandElement.length) {
            const yearHandText = yearHandElement.text().trim();
            const parts = yearHandText.split('•');
            if (parts.length >= 2) {
                carDetails.year = parts[0].trim();
                carDetails.hand = parts[1].trim();
            }
        }
        
        // Try multiple selectors for agency
        let locationElement = $link.find('.feed-item-image-section_agencyName__U_wJp');
        if (!locationElement.length) {
            locationElement = $link.find('.agencyName, [class*="agencyName"]');
        }
        if (locationElement.length) {
            carDetails.agency = locationElement.text().trim();
        }
        
        // Try multiple selectors for image
        let imgElement = $link.find('[data-testid="image"]').first();
        if (!imgElement.length) {
            imgElement = $link.find('img').first();
        }
        if (imgElement.length) {
            carDetails.image = imgElement.attr('src') || '';
        }
        
        // Add if we have at least a title or valid ID
        if ((carDetails.title || carDetails.id !== 'unknown') && carDetails.id !== 'unknown') {
            carListings.push(carDetails);
        }
    });
    
    console.log(`Extracted ${carListings.length} car listings with details`);
    return carListings;
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
    const telenode = new Telenode({apiToken})
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
