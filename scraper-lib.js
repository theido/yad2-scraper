const cheerio = require('cheerio');

const formatPrice = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const numericValue = Number(String(value).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(numericValue)) {
    return String(value).trim();
  }
  return `₪ ${numericValue.toLocaleString('en-US')}`;
};

const normalizeListingLink = (href) => {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `https://www.yad2.co.il${href}`;
  return `https://www.yad2.co.il/${href}`;
};

const buildAnchorListingId = (href) => {
  if (!href || !href.includes('item')) return 'unknown';
  return href.split('/item/')[1]?.split('?')[0] || href.split('item/')[1]?.split('?')[0] || 'unknown';
};

const extractListingsFromAnchors = ($) => {
  let $listingLinks = $('a[href*="/item/"]');

  const $listingLinksNoSlash = $('a[href*="item/"]').filter((_, el) => {
    const href = $(el).attr('href');
    return href && href.startsWith('item/');
  });

  $listingLinks = $listingLinks.add($listingLinksNoSlash);

  console.log(`Found ${$listingLinks.length} listing links in anchor tags`);

  if ($listingLinks.length < 15) {
    console.log(`Found only ${$listingLinks.length} links, checking listing containers...`);
    const $containers = $('[data-testid*="item"], .promotion-layout_container___TZ9j, .promotion-layout-no-footer_container__zrTOu, .ultra-plus_box__rGgJn, .agency-item-no-footer_box__0Ss8o');
    const $containerLinks = $containers.find('a').filter((_, el) => {
      const href = $(el).attr('href');
      return href && (href.includes('/item/') || href.startsWith('item/'));
    });

    console.log(`Found ${$containerLinks.length} links in listing containers`);

    if ($containerLinks.length > $listingLinks.length) {
      $listingLinks = $containerLinks;
    }
  }

  const listings = [];
  const processedIds = new Set();

  $listingLinks.each((_, link) => {
    const $link = $(link);
    const href = $link.attr('href');
    const listingId = buildAnchorListingId(href);

    if (listingId === 'unknown' || processedIds.has(listingId)) return;
    processedIds.add(listingId);

    const listing = {
      id: listingId,
      link: normalizeListingLink(href),
      title: '',
      price: '',
      year: '',
      hand: '',
      location: '',
      image: '',
      agency: ''
    };

    let titleElement = $link.find('[data-nagish="feed-item-section-title"]');
    if (!titleElement.length) {
      titleElement = $link.find('h2, .feed-item-info-section_heading__Bp32t');
    }
    if (titleElement.length) {
      listing.title = titleElement.text().trim();
    }

    let priceElement = $link.find('[data-testid="price"]');
    if (!priceElement.length) {
      priceElement = $link.find('.price_price__xQt90, .feed-item-left-side-section_priceBox__PvCVc');
    }
    if (priceElement.length) {
      listing.price = priceElement.text().trim();
    }

    let locationElement = $link.find('.feed-item-image-section_agencyName__U_wJp');
    if (!locationElement.length) {
      locationElement = $link.find('.agencyName, [class*="agencyName"]');
    }
    if (locationElement.length) {
      listing.agency = locationElement.text().trim();
    }

    let imgElement = $link.find('[data-testid="image"]').first();
    if (!imgElement.length) {
      imgElement = $link.find('img').first();
    }
    if (imgElement.length) {
      listing.image = imgElement.attr('src') || '';
    }

    if (listing.title || listing.id !== 'unknown') {
      listings.push(listing);
    }
  });

  return listings;
};

const extractSlugFromNextData = (queries = []) => {
  for (const query of queries) {
    const queryKey = query?.queryKey;
    if (!Array.isArray(queryKey)) continue;
    const serializedConfig = queryKey.find((part) => typeof part === 'string' && part.includes('"slug"'));
    if (!serializedConfig) continue;

    try {
      const parsedConfig = JSON.parse(serializedConfig);
      const slug = parsedConfig?.slug?.[0];
      if (slug) return slug;
    } catch (error) {
      console.log(`Could not parse slug from query key: ${error.message}`);
    }
  }

  return '';
};

const buildNextDataListingTitle = (item) => {
  const property = item?.additionalDetails?.property?.text;
  const street = item?.address?.street?.text;
  const houseNumber = item?.address?.house?.number;
  const neighborhood = item?.address?.neighborhood?.text;
  const city = item?.address?.city?.text;

  const streetPart = [street, houseNumber].filter(Boolean).join(' ');
  return [property, streetPart, neighborhood, city].filter(Boolean).join(', ');
};

const buildNextDataListingLink = (token, slug, fallbackUrl) => {
  if (!token) return fallbackUrl;
  if (slug) return `https://www.yad2.co.il/realestate/item/${slug}/${token}`;
  return fallbackUrl;
};

const extractListingsFromNextData = ($, fallbackUrl) => {
  const nextDataRaw = $('#__NEXT_DATA__').html();
  if (!nextDataRaw) {
    console.log('No __NEXT_DATA__ payload found');
    return [];
  }

  try {
    const nextData = JSON.parse(nextDataRaw);
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
    const feedQuery = queries.find((query) => {
      const queryKey = query?.queryKey;
      return Array.isArray(queryKey) && typeof queryKey[0] === 'string' && queryKey[0].includes('realestate') && query?.state?.data;
    });

    const feedData = feedQuery?.state?.data;
    if (!feedData || typeof feedData !== 'object') {
      console.log('Could not locate real-estate feed data in __NEXT_DATA__');
      return [];
    }

    const slug = extractSlugFromNextData(queries);
    const sections = Object.values(feedData).filter(Array.isArray);
    const processedIds = new Set();
    const listings = [];

    sections.flat().forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const listingId = item.token || String(item.orderId || '');
      if (!listingId || processedIds.has(listingId)) return;
      processedIds.add(listingId);

      listings.push({
        id: listingId,
        link: buildNextDataListingLink(item.token, slug, fallbackUrl),
        title: buildNextDataListingTitle(item),
        price: formatPrice(item.price),
        year: item?.additionalDetails?.roomsCount ? `${item.additionalDetails.roomsCount} rooms` : '',
        hand: item?.additionalDetails?.squareMeter ? `${item.additionalDetails.squareMeter} sqm` : '',
        location: [item?.address?.neighborhood?.text, item?.address?.city?.text].filter(Boolean).join(', '),
        image: item?.metaData?.coverImage || item?.metaData?.images?.[0] || '',
        agency: item?.businessName || item?.branding?.name || ''
      });
    });

    console.log(`Extracted ${listings.length} listings from __NEXT_DATA__`);
    return listings;
  } catch (error) {
    console.log(`Failed parsing __NEXT_DATA__: ${error.message}`);
    return [];
  }
};

const extractListingsFromHtml = (html, fallbackUrl) => {
  const $ = cheerio.load(html);
  const titleText = $('title').first().text();

  if (titleText === 'ShieldSquare Captcha') {
    throw new Error('Bot detection');
  }

  const anchorListings = extractListingsFromAnchors($);
  if (anchorListings.length > 0) {
    console.log(`Using ${anchorListings.length} listings extracted from anchor tags`);
    return anchorListings;
  }

  const nextDataListings = extractListingsFromNextData($, fallbackUrl);
  if (nextDataListings.length > 0) {
    console.log('Falling back to __NEXT_DATA__ listing extraction');
    return nextDataListings;
  }

  throw new Error('Could not find property listings');
};

module.exports = {
  extractListingsFromHtml,
  formatPrice,
  normalizeListingLink
};
