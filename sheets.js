'use strict';

const { google } = require('googleapis');

const COL = {
    ID: 0, TITLE: 1, LINK: 2, CURRENT_PRICE: 3, PRICE_HISTORY: 4,
    STATUS: 5, FIRST_SEEN: 6, LAST_SEEN: 7, REMOVED_AT: 8,
    IMAGE: 9, AGENCY: 10,
};

const HEADERS = ['ID', 'Title', 'Link', 'Current Price', 'Price History', 'Status', 'First Seen', 'Last Seen', 'Removed At', 'Image', 'Agency'];

function getAuthClient() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');
    let credentials;
    try {
        credentials = JSON.parse(raw);
    } catch {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

function formatPriceEntry(price, dateStr) {
    return `${price} (${dateStr})`;
}

function today() {
    return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

async function getOrCreateSheet(sheetsClient, spreadsheetId, topic) {
    const meta = await sheetsClient.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
    });
    const existing = meta.data.sheets.find(s => s.properties.title === topic);
    if (existing) return;

    await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: topic } } }] },
    });
    await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${topic}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
    });
}

async function readSheet(spreadsheetId, topic) {
    if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID env var is not set');
    const auth = getAuthClient();
    const sheetsClient = google.sheets({ version: 'v4', auth });

    await getOrCreateSheet(sheetsClient, spreadsheetId, topic);

    const res = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: `${topic}!A:K`,
    });

    const rows = res.data.values || [];
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const id = row[COL.ID];
        if (!id) continue;
        map.set(id, {
            rowIndex: i + 1, // 1-based sheet row (row 1 is header)
            currentPrice: row[COL.CURRENT_PRICE] || '',
            status: row[COL.STATUS] || 'active',
            priceHistory: row[COL.PRICE_HISTORY] || '',
            firstSeen: row[COL.FIRST_SEEN] || '',
            lastSeen: row[COL.LAST_SEEN] || '',
        });
    }
    return { sheetsClient, map };
}

async function syncListings(spreadsheetId, topic, scrapedListings) {
    if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID env var is not set');

    const { sheetsClient, map } = await readSheet(spreadsheetId, topic);
    const date = today();

    const newListings = [];
    const priceChanges = [];
    const appendRows = [];
    const batchData = [];
    const seenIds = new Set();

    for (const listing of scrapedListings) {
        seenIds.add(listing.id);
        const existing = map.get(listing.id);

        if (!existing) {
            const priceHistory = listing.price ? formatPriceEntry(listing.price, date) : '';
            appendRows.push([
                listing.id,
                listing.title || '',
                listing.link || '',
                listing.price || '',
                priceHistory,
                'active',
                date,
                date,
                '',
                listing.image || '',
                listing.agency || '',
            ]);
            newListings.push(listing);
        } else if (listing.price && listing.price !== existing.currentPrice) {
            const newHistory = existing.priceHistory
                ? `${existing.priceHistory} → ${formatPriceEntry(listing.price, date)}`
                : formatPriceEntry(listing.price, date);
            batchData.push(
                { range: `${topic}!D${existing.rowIndex}`, values: [[listing.price]] },
                { range: `${topic}!E${existing.rowIndex}`, values: [[newHistory]] },
                { range: `${topic}!H${existing.rowIndex}`, values: [[date]] },
            );
            priceChanges.push({ listing, oldPrice: existing.currentPrice, newPrice: listing.price });
        } else {
            batchData.push({ range: `${topic}!H${existing.rowIndex}`, values: [[date]] });
        }
    }

    // Mark listings no longer on Yad2 as removed
    for (const [id, existing] of map) {
        if (!seenIds.has(id) && existing.status === 'active') {
            batchData.push(
                { range: `${topic}!F${existing.rowIndex}`, values: [['removed']] },
                { range: `${topic}!I${existing.rowIndex}`, values: [[date]] },
            );
        }
    }

    if (appendRows.length > 0) {
        await sheetsClient.spreadsheets.values.append({
            spreadsheetId,
            range: `${topic}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: appendRows },
        });
    }

    if (batchData.length > 0) {
        await sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'RAW', data: batchData },
        });
    }

    return { newListings, priceChanges };
}

module.exports = { syncListings };
