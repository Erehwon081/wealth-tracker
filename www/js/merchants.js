// Starter rules for sorting spending into categories, by words found in the transaction description.
// These are common Australian merchants and terms. A user's own rules (Settings > Category rules) always win.
// The first match wins, so more specific entries sit above general ones (COLES EXPRESS under Fuel before COLES under Groceries).
export const MERCHANT_RULES = [
  ['Rego', ['VICROADS', 'SERVICE NSW', 'TMR QLD', 'ACCESS CANBERRA', 'REGISTRATION RENEWAL']],
  ['Fuel', ['AMPOL', 'CALTEX', '7-ELEVEN', 'SHELL', 'BP ', 'UNITED PETROL', 'LIBERTY OIL', 'METRO PETROL', 'PUMA ENERGY', 'OTR ', 'REDDY EXPRESS', 'EG FUEL', 'COLES EXPRESS']],
  ['Groceries', ['WOOLWORTHS', 'COLES', 'ALDI', 'IGA ', 'HARRIS FARM', 'COSTCO', 'FOODWORKS', 'SPUDSHED', 'FOODLAND', 'SUPABARN', 'BAKER', 'BUTCHER', 'GREENGROCER', 'BROTHERS']],
  ['Eating out', ['MCDONALD', 'KFC', 'HUNGRY JACK', 'GUZMAN', 'DOMINO', 'UBER EATS', 'UBEREATS', 'UBER *EATS', 'UBER* EATS', 'MENULOG', 'DOORDASH', 'SUBWAY', 'NANDO', "GRILL'D", 'RED ROOSTER', 'OPORTO', 'ZAMBRERO', 'SUSHI', 'RAMEN', 'DUMPLING', 'PIZZA', 'RESTAURANT', 'KITCHEN', 'THAI', 'BISTRO', 'TAVERN']],
  ['Cafes', ['CAFE', 'COFFEE', 'STARBUCKS', 'GLORIA JEAN', 'ESPRESSO', 'ROASTER', 'JORGE']],
  ['Transport', ['LINKT', 'MYKI', 'OPAL', 'TRANSLINK', 'UBER', 'DIDI', 'OLA ', '13CABS', 'TAXI', 'PARKING', 'WILSON PARK', 'SECURE PARK', 'E-TOLL', 'ETOLL', 'METRO TRAINS', 'VLINE']],
  ['Bills', ['TELSTRA', 'OPTUS', 'VODAFONE', 'AUSSIE BROADBAND', 'TPG ', 'IINET', 'BELONG', 'AMAYSIM', 'BOOST MOBILE', 'AGL ', 'ORIGIN ENERGY', 'ENERGYAUSTRALIA', 'ENERGY AUSTRALIA', 'RED ENERGY', 'ALINTA', 'POWERSHOP', 'TANGO ENERGY', ' WATER ', 'SUPERLOOP', 'DODO ']],
  ['Insurance', ['INSURANCE', 'NRMA', 'RACV', 'RACQ', 'AAMI', 'ALLIANZ', 'BUDGET DIRECT', 'YOUI', 'SUNCORP INS', 'BUPA', 'MEDIBANK', 'HCF', 'NIB ', 'AHM ', 'PETSURE']],
  ['Health', ['CHEMIST', 'PHARMACY', 'PRICELINE', 'MEDICAL', 'DENTAL', 'DENTIST', 'PHYSIO', 'PATHOLOGY', 'OPTOMETR', 'SPECSAVERS', 'DOCTOR', 'HOSPITAL', 'TERRYWHITE']],
  ['Personal care', ['HAIR', 'BARBER', 'SKINCARE', 'BEAUTY', 'MECCA', 'SEPHORA', 'NAILS', 'MASSAGE']],
  ['Pets', ['PETBARN', 'PETSTOCK', 'PET CIRCLE', 'VET ', 'VETERINAR', 'PETS ']],
  ['Home & furniture', ['BUNNINGS', 'IKEA', 'MITRE 10', 'FREEDOM FURN', 'ADAIRS', 'HARVEY NORMAN', 'THE GOOD GUYS', 'TEMPLE & WEBSTER', 'SPOTLIGHT']],
  ['Clothing', ['COTTON ON', 'UNIQLO', 'H&M', 'ZARA', 'THE ICONIC', 'COUNTRY ROAD', 'REBEL SPORT', 'KATHMANDU', 'NIKE', 'ADIDAS', 'CONNOR', 'ATHLETES FOOT']],
  ['Shopping', ['AMAZON', 'KMART', 'TARGET', 'BIG W', 'JB HI-FI', 'JB HI FI', 'OFFICEWORKS', 'EBAY', 'MYER', 'DAVID JONES', 'CATCH.COM', 'TEMU', 'SHEIN', 'DAN MURPHY', 'BWS', 'LIQUORLAND']],
  ['Entertainment', ['HOYTS', 'EVENT CINEMA', 'VILLAGE CINEMA', 'PALACE CINEMA', 'TICKETEK', 'TICKETMASTER', 'STEAM ', 'STEAMGAMES', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'BOWLING', ' ZOO ']],
  ['Subscriptions', ['NETFLIX', 'SPOTIFY', 'DISNEY', 'APPLE.COM/BILL', 'GOOGLE', 'STAN.COM', 'STAN ', 'YOUTUBE', 'BINGE', 'KAYO', 'PARAMOUNT', 'AUDIBLE', 'PRIME VIDEO', 'ICLOUD', 'MICROSOFT', 'ADOBE', 'DROPBOX', 'CHATGPT', 'OPENAI', 'CLAUDE.AI']],
  ['Services', ['DRY CLEAN', 'LAUNDR', 'AUSTRALIA POST', 'AUSPOST', 'ACCOUNTANT', 'SOLICITOR', 'CLEANING']],
  ['Gifts', ['FLORIST', 'FLOWERS', 'GIFT', 'DONATION', 'CHARITY', 'RED CROSS', 'GOFUNDME']],
  ['Interest & fees', ['INTEREST CHARGE', 'ACCOUNT FEE', 'LATE FEE', 'ANNUAL FEE', 'INTERNATIONAL TRANSACTION FEE', 'OVERDRAWN FEE']],
  ['Other', ['ANMF']], // carried over from the first user's setup, along with BAKER, BROTHERS and JORGE above; review before selling
];

// The category for a description, or null if nothing matches.
export function seedCategory(desc) {
  const d = ' ' + String(desc || '').toUpperCase() + ' ';
  for (const [cat, words] of MERCHANT_RULES) for (const w of words) if (d.includes(w)) return cat;
  return null;
}
