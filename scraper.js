// Load environment variables from .env file
require('dotenv').config();

const Telenode = require('telenode-js');
const fs = require('fs');
const path = require('path');
const {
    getEffectiveNotionDatabaseId,
    getEffectiveTelegramTarget,
    loadConfig,
    normalizeConfig
} = require('./config-lib');
const { syncListingsToNotion } = require('./notion-lib');
const { extractListingsFromHtml, createBotDetectionError } = require('./scraper-lib');
const { fetchYad2ViaChrome } = require('./yad2-browser-fetcher');

const BOT_RETRY_DELAYS_MS = [1500, 4000, 8000];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getYad2FetchMode = () => String(process.env.YAD2_FETCH_MODE || 'http').trim().toLowerCase();

const getYad2ResponseOverHttp = async (url) => {
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

    const res = await fetch(url, requestOptions);
    return await res.text();
}

const getYad2Response = async (url) => {
    const fetchMode = getYad2FetchMode();
    if (fetchMode === 'chrome') {
        return fetchYad2ViaChrome(url);
    }

    try {
        return await getYad2ResponseOverHttp(url);
    } catch (err) {
        console.log(err)
    }
}

const scrapeItemsAndExtractDetails = async (url) => {
    let lastBotDetectionMessage = '';

    for (let attempt = 1; attempt <= BOT_RETRY_DELAYS_MS.length + 1; attempt += 1) {
        const yad2Html = await getYad2Response(url);
        if (!yad2Html) {
            throw new Error("Could not get Yad2 response");
        }

        try {
            const listings = extractListingsFromHtml(yad2Html, url);
            console.log(`Extracted ${listings.length} listings with details on attempt ${attempt}`);
            return listings;
        } catch (error) {
            if (error?.code !== 'BOT_DETECTION') {
                throw error;
            }

            lastBotDetectionMessage = error.message || lastBotDetectionMessage;
            const nextDelay = BOT_RETRY_DELAYS_MS[attempt - 1];
            if (!nextDelay) {
                throw createBotDetectionError(lastBotDetectionMessage || `Bot detection persisted after ${attempt} attempts`);
            }

            console.warn(`Bot protection hit on attempt ${attempt}; retrying in ${nextDelay}ms`);
            await sleep(nextDelay);
        }
    }

    throw createBotDetectionError(lastBotDetectionMessage || 'Bot detection persisted after retries');
}

const sanitizeTopicFileName = (topic) => String(topic || '').replace(/[\\/:*?"<>|]/g, '_');

const assertHealthyListingResult = (currentListings, savedListings, topic) => {
    if (!Array.isArray(currentListings) || !Array.isArray(savedListings)) {
        throw new TypeError('Listing health check expects arrays');
    }

    if (currentListings.length === 0 && savedListings.length > 0) {
        const error = new Error(
            `Suspicious empty result for ${topic}: found 0 listings with ${savedListings.length} previously saved`
        );
        error.code = 'SUSPICIOUS_EMPTY_RESULTS';
        throw error;
    }
};

const checkIfHasNewItems = async (carListings, topic, options = {}) => {
    const dataDir = options.dataDir || path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, `${sanitizeTopicFileName(topic)}.json`);
    let savedListings = [];
    try {
        savedListings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        if (e.code === "ENOENT") {
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(filePath, '[]');
        } else {
            console.log(e);
            throw new Error(`Could not read / create ${filePath}`);
        }
    }

    assertHealthyListingResult(carListings, savedListings, topic);

    const savedIds = savedListings.map(car => car.id);
    const newItems = [];
    const allListings = [...savedListings];

    carListings.forEach(car => {
        if (!savedIds.includes(car.id)) {
            allListings.push(car);
            newItems.push(car);
        }
    });

    if (newItems.length > 0 || allListings.length !== savedListings.length) {
        if (typeof options.beforePersist === 'function') {
            await options.beforePersist(newItems);
        }
        const updatedListings = JSON.stringify(allListings, null, 2);
        fs.writeFileSync(filePath, updatedListings);
        await createPushFlagForWorkflow();
    }

    return newItems;
}

const createPushFlagForWorkflow = () => {
    fs.writeFileSync("push_me", "")
}

const normalizeTelegramChatId = (target) => {
    const value = String(target || '').trim();
    return value.startsWith('telegram:') ? value.slice('telegram:'.length) : value;
};

const createTelegramClient = (project, settings = {}, apiTokenOverride = '') => {
    const apiToken = apiTokenOverride || process.env.API_TOKEN;
    const target = getEffectiveTelegramTarget(project, settings) || process.env.CHAT_ID || '';
    const chatId = normalizeTelegramChatId(target);

    if (!apiToken || !chatId) {
        return { telenode: null, chatId: null };
    }

    return {
        telenode: new Telenode({ apiToken }),
        chatId
    };
};

const sendTelegramMessageSafe = async (telenode, chatId, message) => {
    if (!telenode || !chatId) {
        return false;
    }

    try {
        await telenode.sendTextMessage(message, chatId);
        return true;
    } catch (error) {
        console.error(`Telegram notification failed: ${error.message}`);
        return false;
    }
};

const buildListingOutputPayload = (topic, listing) => ({
    topic,
    id: listing.id || '',
    title: listing.title || '',
    price: listing.price || '',
    year: listing.year || '',
    hand: listing.hand || '',
    location: listing.location || '',
    agency: listing.agency || '',
    link: listing.link || '',
    image: listing.image || ''
});

const logNewListingDetails = (topic, listings) => {
    listings.forEach((listing, index) => {
        console.log(`NEW_LISTING ${JSON.stringify({
            index: index + 1,
            ...buildListingOutputPayload(topic, listing)
        })}`);
    });
};

const getNotionToken = (settings = {}) => {
    const envName = settings.notionTokenEnv || 'NOTION_API_TOKEN';
    return process.env[envName] || process.env.NOTION_API_TOKEN || process.env.NOTION_API_KEY || '';
};

const syncTopicToNotion = async (project, settings, newItems) => {
    const notionDatabaseId = getEffectiveNotionDatabaseId(project, settings);
    const notionToken = getNotionToken(settings);

    if (!notionDatabaseId) {
        console.log(`Notion sync skipped for ${project.topic}: no database configured`);
        return { skipped: true, reason: 'no_database' };
    }

    if (!notionToken) {
        console.log(`Notion sync skipped for ${project.topic}: no token available`);
        return { skipped: true, reason: 'no_token' };
    }

    const result = await syncListingsToNotion({
        token: notionToken,
        databaseId: notionDatabaseId,
        topic: project.topic,
        listings: newItems
    });

    console.log(`NOTION_SYNC ${JSON.stringify({
        topic: project.topic,
        databaseId: notionDatabaseId,
        ...result
    })}`);

    return result;
};

const scrape = async (project, settings) => {
    const { telenode, chatId } = createTelegramClient(project, settings);
    const telegramTarget = getEffectiveTelegramTarget(project, settings);
    const notionDatabaseId = getEffectiveNotionDatabaseId(project, settings);

    try {
        console.log(`Starting scanning ${project.topic} on link: ${project.url}`);
        if (chatId) {
            await sendTelegramMessageSafe(telenode, chatId, `🔍 Starting scan for ${project.topic}...`);
        }

        await sleep(2000);

        const carListings = await scrapeItemsAndExtractDetails(project.url);
        const newItems = await checkIfHasNewItems(carListings, project.topic, {
            beforePersist: async (items) => syncTopicToNotion(project, settings, items)
        });

        console.log(`Scan summary for ${project.topic}: total=${carListings.length} new=${newItems.length}`);
        console.log(`TOPIC_SUMMARY ${JSON.stringify({
            topic: project.topic,
            total: carListings.length,
            new: newItems.length,
            telegramTarget,
            notionDatabaseId
        })}`);

        if (newItems.length > 0) {
            console.log(`Found ${newItems.length} new car listings for ${project.topic}`);
            logNewListingDetails(project.topic, newItems);
            if (chatId) {
                await sendTelegramMessageSafe(
                    telenode,
                    chatId,
                    `🚗 Found ${newItems.length} new ${project.topic} listings!\n\n` +
                    `Total listings found: ${carListings.length}\n\n` +
                    `🔍 Search URL: ${project.url}`
                );

                const itemsToSend = newItems.slice(0, 5);
                for (const car of itemsToSend) {
                    const message = formatCarMessage(car);
                    await sendTelegramMessageSafe(telenode, chatId, message);
                    await sleep(1000);
                }

                if (newItems.length > 5) {
                    await sendTelegramMessageSafe(
                        telenode,
                        chatId,
                        `... and ${newItems.length - 5} more listings! Check the full list on Yad2.`
                    );
                }
            }
        } else if (chatId) {
            console.log(`No new items found for ${project.topic}`);
            await sendTelegramMessageSafe(
                telenode,
                chatId,
                `✅ No new ${project.topic} listings found.\nTotal listings: ${carListings.length}\n\n🔍 Search URL: ${project.url}`
            );
        }
    } catch (e) {
        if (e?.code === 'BOT_DETECTION') {
            console.warn(`Bot protection persisted for ${project.topic}: ${e.message}`);
        }

        let errMsg = e?.message || "";
        if (errMsg) {
            errMsg = `Error: ${errMsg}`;
        }
        console.error(`Error scanning ${project.topic}:`, errMsg);
        if (chatId) {
            await sendTelegramMessageSafe(telenode, chatId, `❌ Scan failed for ${project.topic}:\n${errMsg}\n\n🔍 Search URL: ${project.url}`);
        }
        throw e;
    }

    return true;
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

const loadRuntimeConfig = () => {
    const envProjects = process.env.SCRAPER_PROJECTS;

    if (envProjects) {
        try {
            console.log('Using SCRAPER_PROJECTS environment configuration');
            const parsed = JSON.parse(envProjects);
            return normalizeConfig(parsed);
        } catch (error) {
            console.error('Error parsing SCRAPER_PROJECTS:', error.message);
            console.log('Falling back to config.json');
        }
    }

    console.log('Using config.json for configuration');
    return loadConfig();
};

const program = async () => {
    const runtimeConfig = loadRuntimeConfig();
    const projects = runtimeConfig.projects.filter(project => {
        if (project.disabled) {
            console.log(`Topic "${project.topic}" is disabled. Skipping.`);
        }
        return !project.disabled;
    });

    if (getYad2FetchMode() === 'chrome') {
        for (const project of projects) {
            await scrape(project, runtimeConfig.settings);
        }
        return;
    }

    await Promise.all(projects.map(async project => {
        await scrape(project, runtimeConfig.settings)
    }))
};

if (require.main === module) {
    program();
}

module.exports = {
    BOT_RETRY_DELAYS_MS,
    assertHealthyListingResult,
    checkIfHasNewItems,
    createTelegramClient,
    formatCarMessage,
    getNotionToken,
    getYad2FetchMode,
    getYad2Response,
    loadRuntimeConfig,
    normalizeTelegramChatId,
    scrapeItemsAndExtractDetails,
    scrape,
    program,
    sleep,
    syncTopicToNotion
};
