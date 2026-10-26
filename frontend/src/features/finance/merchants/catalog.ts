/*
 * Merchant catalogue for transaction icons: Polish shops, restaurants, services and payment
 * providers. Started from the «family-os-polish-merchant-kit» list and tuned for real bank
 * descriptions.
 *
 * Add a brand: one line with a stable `id` (a–z, 0–9, _; it is also the logo file name),
 * the display `name`, a `category` and `aliases` as they appear in bank texts. Matching ignores
 * case, Polish diacritics, punctuation, store/terminal numbers and legal suffixes.
 * An alias starting with "=" is an ordinary word or very short (play, plus, bp, temu…): it only
 * matches the beginning of the merchant field, never free descriptions, and only when the
 * transaction's category does not contradict the brand.
 * A logo is shown only if public/assets/brands/<id>.svg or <id>.webp exists (see brandLogos.ts);
 * otherwise the category illustration is used.
 */
import type { MerchantCategory } from "./types";

export interface BrandEntry {
  id: string;
  name: string;
  category: MerchantCategory;
  aliases: readonly string[];
}

export const BRANDS: readonly BrandEntry[] = [
  // grocery
  { id: "biedronka", name: "Biedronka", category: "grocery", aliases: ["Biedronka", "jeronimo martins", "biedronka sklep"] },
  { id: "lidl", name: "Lidl", category: "grocery", aliases: ["Lidl", "lidl polska", "lidl sp"] },
  { id: "zabka", name: "Żabka", category: "grocery", aliases: ["Żabka", "zabka polska", "zabka nano", "zabka n", "zappka"] },
  { id: "aldi", name: "ALDI", category: "grocery", aliases: ["ALDI", "aldi polska"] },
  { id: "kaufland", name: "Kaufland", category: "grocery", aliases: ["Kaufland"] },
  { id: "carrefour", name: "Carrefour", category: "grocery", aliases: ["Carrefour", "carrefour express"] },
  { id: "auchan", name: "Auchan", category: "grocery", aliases: ["Auchan"] },
  { id: "dino", name: "Dino", category: "grocery", aliases: ["=dino", "market dino", "dino polska", "dino market"] },
  { id: "netto", name: "Netto", category: "grocery", aliases: ["=netto", "netto polska", "netto sklep"] },
  { id: "stokrotka", name: "Stokrotka", category: "grocery", aliases: ["Stokrotka"] },
  { id: "lewiatan", name: "Lewiatan", category: "grocery", aliases: ["Lewiatan"] },
  { id: "intermarche", name: "Intermarché", category: "grocery", aliases: ["Intermarché", "intermarche"] },
  { id: "polomarket", name: "POLOmarket", category: "grocery", aliases: ["POLOmarket", "polo market"] },
  { id: "delikatesy_centrum", name: "Delikatesy Centrum", category: "grocery", aliases: ["Delikatesy Centrum"] },
  { id: "spar", name: "SPAR", category: "grocery", aliases: ["=spar", "euro spar", "eurospar", "spar polska"] },
  { id: "e_leclerc", name: "E.Leclerc", category: "grocery", aliases: ["E.Leclerc", "leclerc"] },
  { id: "makro", name: "MAKRO", category: "grocery", aliases: ["=makro", "makro cash and carry", "makro cash carry"] },
  { id: "selgros", name: "Selgros", category: "grocery", aliases: ["Selgros"] },
  { id: "frisco", name: "Frisco", category: "grocery", aliases: ["=frisco", "frisco.pl"] },
  { id: "topaz", name: "Topaz", category: "grocery", aliases: ["=topaz", "topaz sklep", "supermarket topaz"] },
  { id: "spolem", name: "Społem", category: "grocery", aliases: ["Społem"] },
  { id: "abc_sklep", name: "ABC", category: "grocery", aliases: ["=abc", "abc sklep", "sklep abc", "delikatesy abc"] },
  { id: "groszek", name: "Groszek", category: "grocery", aliases: ["=groszek", "sklep groszek", "delikatesy groszek"] },
  { id: "odido", name: "Odido", category: "grocery", aliases: ["Odido"] },
  { id: "chata_polska", name: "Chata Polska", category: "grocery", aliases: ["Chata Polska"] },
  { id: "twoj_market", name: "Twój Market", category: "grocery", aliases: ["Twój Market"] },
  { id: "euro_sklep", name: "Euro Sklep", category: "grocery", aliases: ["Euro Sklep"] },
  { id: "bi1", name: "bi1", category: "grocery", aliases: ["bi1", "bi 1"] },
  // marketplace
  { id: "allegro", name: "Allegro", category: "marketplace", aliases: ["Allegro", "allegro.pl", "allegro pay"] },
  { id: "olx", name: "OLX", category: "marketplace", aliases: ["OLX", "olx.pl"] },
  { id: "amazon", name: "Amazon", category: "marketplace", aliases: ["Amazon", "amazon.pl", "amzn", "amazon prime", "prime video", "amazon marketplace"] },
  { id: "temu", name: "Temu", category: "marketplace", aliases: ["=temu", "temu.com", "temu com"] },
  { id: "aliexpress", name: "AliExpress", category: "marketplace", aliases: ["AliExpress", "ali express"] },
  { id: "ebay", name: "eBay", category: "marketplace", aliases: ["eBay", "ebay.pl"] },
  { id: "etsy", name: "Etsy", category: "marketplace", aliases: ["Etsy"] },
  { id: "kaufland_marketplace", name: "Kaufland Marketplace", category: "marketplace", aliases: ["Kaufland Marketplace"] },
  // fashion
  { id: "shein", name: "SHEIN", category: "fashion", aliases: ["SHEIN"] },
  { id: "vinted", name: "Vinted", category: "fashion", aliases: ["Vinted"] },
  { id: "zalando", name: "Zalando", category: "fashion", aliases: ["Zalando", "zalando lounge"] },
  { id: "modivo", name: "MODIVO", category: "fashion", aliases: ["MODIVO"] },
  { id: "eobuwie", name: "eobuwie", category: "fashion", aliases: ["eobuwie"] },
  { id: "ccc", name: "CCC", category: "fashion", aliases: ["CCC"] },
  { id: "reserved", name: "Reserved", category: "fashion", aliases: ["Reserved"] },
  { id: "hm", name: "H&M", category: "fashion", aliases: ["H&M", "hm.com"] },
  { id: "zara", name: "Zara", category: "fashion", aliases: ["Zara"] },
  { id: "sinsay", name: "Sinsay", category: "fashion", aliases: ["Sinsay"] },
  { id: "tk_maxx", name: "TK Maxx", category: "fashion", aliases: ["TK Maxx", "tkmaxx", "tk maxx"] },
  { id: "primark", name: "Primark", category: "fashion", aliases: ["Primark"] },
  { id: "half_price", name: "Half Price", category: "fashion", aliases: ["Half Price", "halfprice"] },
  { id: "4f", name: "4F", category: "fashion", aliases: ["4F", "4f sklep", "4f.com.pl"] },
  // retail
  { id: "empik", name: "Empik", category: "retail", aliases: ["Empik", "empik.com"] },
  { id: "smyk", name: "Smyk", category: "retail", aliases: ["Smyk", "smyk.com"] },
  // discount_retail
  { id: "action", name: "Action", category: "discount_retail", aliases: ["=action", "action polska", "action sklep"] },
  { id: "pepco", name: "Pepco", category: "discount_retail", aliases: ["Pepco"] },
  { id: "dealz", name: "Dealz", category: "discount_retail", aliases: ["Dealz"] },
  { id: "tedi", name: "TEDi", category: "discount_retail", aliases: ["TEDi"] },
  // home
  { id: "ikea", name: "IKEA", category: "home", aliases: ["IKEA"] },
  { id: "leroy_merlin", name: "Leroy Merlin", category: "home", aliases: ["Leroy Merlin"] },
  { id: "castorama", name: "Castorama", category: "home", aliases: ["Castorama"] },
  { id: "obi", name: "OBI", category: "home", aliases: ["=obi", "obi market", "obi polska"] },
  { id: "jysk", name: "JYSK", category: "home", aliases: ["JYSK"] },
  { id: "bricomarche", name: "Bricomarché", category: "home", aliases: ["Bricomarché", "bricomarche"] },
  // sports
  { id: "decathlon", name: "Decathlon", category: "sports", aliases: ["Decathlon"] },
  // electronics
  { id: "media_expert", name: "Media Expert", category: "electronics", aliases: ["Media Expert"] },
  { id: "rtv_euro_agd", name: "RTV Euro AGD", category: "electronics", aliases: ["RTV Euro AGD", "euro agd"] },
  { id: "mediamarkt", name: "MediaMarkt", category: "electronics", aliases: ["MediaMarkt", "media markt"] },
  { id: "xkom", name: "x-kom", category: "electronics", aliases: ["x-kom", "xkom", "x kom"] },
  { id: "komputronik", name: "Komputronik", category: "electronics", aliases: ["Komputronik"] },
  { id: "morele", name: "Morele.net", category: "electronics", aliases: ["Morele.net", "morele"] },
  { id: "neonet", name: "NEONET", category: "electronics", aliases: ["NEONET"] },
  { id: "apple", name: "Apple", category: "electronics", aliases: ["=Apple", "apple.com bill", "apple com bill", "itunes", "app store", "apple music", "apple store"] },
  { id: "samsung", name: "Samsung", category: "electronics", aliases: ["Samsung"] },
  // digital
  { id: "playstation", name: "PlayStation", category: "digital", aliases: ["PlayStation", "psn", "sony interactive"] },
  { id: "steam", name: "Steam", category: "digital", aliases: ["=steam", "steampowered", "steam purchase", "valve"] },
  { id: "google", name: "Google", category: "digital", aliases: ["=Google", "google cloud", "google one", "google storage"] },
  { id: "microsoft", name: "Microsoft", category: "digital", aliases: ["Microsoft", "microsoft store", "msft"] },
  { id: "google_play", name: "Google Play", category: "digital", aliases: ["Google Play", "google play store", "google *play", "googleplay"] },
  { id: "xbox", name: "Xbox", category: "digital", aliases: ["Xbox", "xbox live", "xbox game pass", "microsoft xbox"] },
  // drugstore
  { id: "rossmann", name: "Rossmann", category: "drugstore", aliases: ["Rossmann"] },
  { id: "hebe", name: "Hebe", category: "drugstore", aliases: ["=hebe", "drogeria hebe", "hebe.pl"] },
  { id: "dm", name: "dm", category: "drugstore", aliases: ["=dm", "dm drogerie", "drogerie dm", "dm drogerie markt"] },
  { id: "super_pharm", name: "Super-Pharm", category: "drugstore", aliases: ["Super-Pharm"] },
  { id: "sephora", name: "Sephora", category: "drugstore", aliases: ["Sephora"] },
  { id: "douglas", name: "Douglas", category: "drugstore", aliases: ["Douglas", "perfumeria douglas"] },
  { id: "notino", name: "Notino", category: "drugstore", aliases: ["Notino", "notino.pl"] },
  // pharmacy
  { id: "doz", name: "DOZ.pl", category: "pharmacy", aliases: ["DOZ.pl", "doz apteka"] },
  { id: "apteka_gemini", name: "Apteka Gemini", category: "pharmacy", aliases: ["Apteka Gemini", "gemini"] },
  { id: "dr_max", name: "Dr.Max", category: "pharmacy", aliases: ["Dr.Max"] },
  { id: "ziko", name: "Ziko Apteka", category: "pharmacy", aliases: ["Ziko Apteka", "ziko"] },
  // health
  { id: "medicover", name: "Medicover", category: "health", aliases: ["Medicover"] },
  { id: "luxmed", name: "LUX MED", category: "health", aliases: ["LUX MED", "luxmed"] },
  // fitness
  { id: "fitness24seven", name: "Fitness24Seven", category: "fitness", aliases: ["Fitness24Seven"] },
  // restaurant
  { id: "mcdonalds", name: "McDonald's", category: "restaurant", aliases: ["McDonald's", "mcdonalds", "mc donalds", "mcdonald s"] },
  { id: "kfc", name: "KFC", category: "restaurant", aliases: ["KFC"] },
  { id: "burger_king", name: "Burger King", category: "restaurant", aliases: ["Burger King"] },
  { id: "subway", name: "Subway", category: "restaurant", aliases: ["Subway"] },
  { id: "pizza_hut", name: "Pizza Hut", category: "restaurant", aliases: ["Pizza Hut"] },
  { id: "starbucks", name: "Starbucks", category: "restaurant", aliases: ["Starbucks"] },
  { id: "costa_coffee", name: "Costa Coffee", category: "restaurant", aliases: ["Costa Coffee", "=costa"] },
  { id: "dominos", name: "Domino's", category: "restaurant", aliases: ["Domino's", "dominos pizza", "domino s pizza"] },
  { id: "telepizza", name: "Telepizza", category: "restaurant", aliases: ["Telepizza"] },
  { id: "north_fish", name: "North Fish", category: "restaurant", aliases: ["North Fish", "northfish"] },
  { id: "da_grasso", name: "Da Grasso", category: "restaurant", aliases: ["Da Grasso", "dagrasso"] },
  { id: "pizza_dominium", name: "Pizza Dominium", category: "restaurant", aliases: ["Pizza Dominium", "dominium pizza"] },
  // food_delivery
  { id: "uber_eats", name: "Uber Eats", category: "food_delivery", aliases: ["Uber Eats"] },
  { id: "glovo", name: "Glovo", category: "food_delivery", aliases: ["Glovo"] },
  { id: "wolt", name: "Wolt", category: "food_delivery", aliases: ["Wolt"] },
  { id: "pyszne", name: "Pyszne.pl", category: "food_delivery", aliases: ["Pyszne.pl", "pyszne"] },
  { id: "bolt_food", name: "Bolt Food", category: "food_delivery", aliases: ["Bolt Food"] },
  // transport
  { id: "uber", name: "Uber", category: "transport", aliases: ["Uber", "uber trip", "uber bv"] },
  { id: "bolt", name: "Bolt", category: "transport", aliases: ["=bolt", "bolt.eu", "bolt ride", "bolt rides"] },
  { id: "mpk", name: "MPK", category: "transport", aliases: ["=mpk", "miejskie przedsiębiorstwo komunikacyjne", "mpk wroclaw", "mpk krakow", "mpk lodz", "mpk poznan"] },
  { id: "jakdojade", name: "Jakdojade", category: "transport", aliases: ["Jakdojade", "jak dojade"] },
  { id: "pkp_intercity", name: "PKP Intercity", category: "transport", aliases: ["PKP Intercity"] },
  { id: "koleo", name: "KOLEO", category: "transport", aliases: ["KOLEO"] },
  { id: "polregio", name: "POLREGIO", category: "transport", aliases: ["POLREGIO", "przewozy regionalne"] },
  { id: "flixbus", name: "FlixBus", category: "transport", aliases: ["FlixBus", "flix bus", "flixtrain"] },
  { id: "lime", name: "Lime", category: "transport", aliases: ["lime scooter", "lime ride", "limebike", "=lime"] },
  { id: "skycash", name: "SkyCash", category: "transport", aliases: ["SkyCash", "sky cash"] },
  { id: "mobilet", name: "moBILET", category: "transport", aliases: ["moBILET", "mobilet"] },
  { id: "freenow", name: "FREENOW", category: "transport", aliases: ["FREE NOW", "freenow", "mytaxi"] },
  // fuel
  { id: "orlen", name: "ORLEN", category: "fuel", aliases: ["ORLEN", "pkn orlen"] },
  { id: "bp", name: "bp", category: "fuel", aliases: ["=bp", "bp station", "bp polska", "bp stacja"] },
  { id: "shell", name: "Shell", category: "fuel", aliases: ["=shell", "shell polska", "shell stacja"] },
  { id: "circle_k", name: "Circle K", category: "fuel", aliases: ["Circle K"] },
  { id: "moya", name: "MOYA", category: "fuel", aliases: ["=moya", "moya stacja"] },
  { id: "amic", name: "Amic Energy", category: "fuel", aliases: ["Amic", "amic energy", "amic stacja"] },
  { id: "mol", name: "MOL", category: "fuel", aliases: ["=mol", "mol stacja", "mol polska"] },
  { id: "lotos", name: "Lotos", category: "fuel", aliases: ["Lotos", "lotos stacja", "lotos paliwa"] },
  // delivery
  { id: "inpost", name: "InPost", category: "delivery", aliases: ["InPost", "paczkomat"] },
  { id: "dpd", name: "DPD", category: "delivery", aliases: ["=dpd", "dpd polska", "dpd pickup"] },
  { id: "dhl", name: "DHL", category: "delivery", aliases: ["DHL"] },
  { id: "ups", name: "UPS", category: "delivery", aliases: ["=ups", "ups polska"] },
  { id: "poczta_polska", name: "Poczta Polska", category: "delivery", aliases: ["Poczta Polska"] },
  // travel
  { id: "booking", name: "Booking.com", category: "travel", aliases: ["Booking.com", "booking"] },
  { id: "airbnb", name: "Airbnb", category: "travel", aliases: ["Airbnb"] },
  { id: "ryanair", name: "Ryanair", category: "travel", aliases: ["Ryanair"] },
  { id: "lot", name: "LOT Polish Airlines", category: "travel", aliases: ["LOT Polish Airlines", "polskie linie lotnicze", "=lot"] },
  { id: "wizz_air", name: "Wizz Air", category: "travel", aliases: ["Wizz Air", "wizzair", "wizz air hungary"] },
  { id: "lufthansa", name: "Lufthansa", category: "travel", aliases: ["Lufthansa", "deutsche lufthansa"] },
  { id: "easyjet", name: "easyJet", category: "travel", aliases: ["easyJet", "easyjet airline"] },
  // entertainment
  { id: "cinema_city", name: "Cinema City", category: "entertainment", aliases: ["Cinema City"] },
  { id: "multikino", name: "Multikino", category: "entertainment", aliases: ["Multikino"] },
  { id: "helios", name: "Kino Helios", category: "entertainment", aliases: ["Helios", "kino helios", "helios sa"] },
  // telecom
  { id: "orange", name: "Orange", category: "telecom", aliases: ["=orange", "orange polska", "orange.pl"] },
  { id: "play", name: "Play", category: "telecom", aliases: ["=play", "p4 sp", "play polska", "play.pl", "play online"] },
  { id: "plus", name: "Plus", category: "telecom", aliases: ["=plus", "polkomtel", "plus gsm", "plus.pl", "plushbezlimitu"] },
  { id: "t_mobile", name: "T-Mobile", category: "telecom", aliases: ["T-Mobile", "tmobile"] },
  { id: "vectra", name: "Vectra", category: "telecom", aliases: ["Vectra", "vectra sa"] },
  // utilities
  { id: "netia", name: "Netia", category: "utilities", aliases: ["Netia"] },
  { id: "pge", name: "PGE", category: "utilities", aliases: ["PGE"] },
  { id: "tauron", name: "Tauron", category: "utilities", aliases: ["Tauron"] },
  { id: "enea", name: "Enea", category: "utilities", aliases: ["=enea", "enea sa", "enea operator"] },
  { id: "energa", name: "Energa", category: "utilities", aliases: ["=energa", "energa obrot", "energa operator"] },
  { id: "pgnig", name: "PGNiG", category: "utilities", aliases: ["PGNiG", "pgnig obrot", "pgnig sa"] },
  { id: "pzu", name: "PZU", category: "utilities", aliases: ["PZU", "pzu sa", "pzu zycie"] },
  // subscription
  { id: "netflix", name: "Netflix", category: "subscription", aliases: ["Netflix"] },
  { id: "spotify", name: "Spotify", category: "subscription", aliases: ["Spotify"] },
  { id: "youtube", name: "YouTube", category: "subscription", aliases: ["YouTube", "youtube premium", "youtubepremium", "google youtube"] },
  { id: "disney_plus", name: "Disney+", category: "subscription", aliases: ["Disney+", "disney plus"] },
  { id: "hbo_max", name: "HBO Max", category: "subscription", aliases: ["HBO Max", "hbomax", "max.com", "=max"] },
  { id: "canal_plus", name: "CANAL+", category: "subscription", aliases: ["CANAL+", "canal plus"] },
  { id: "deezer", name: "Deezer", category: "subscription", aliases: ["Deezer"] },
  { id: "tidal", name: "TIDAL", category: "subscription", aliases: ["TIDAL", "tidal music"] },
  { id: "duolingo", name: "Duolingo", category: "subscription", aliases: ["Duolingo"] },
  { id: "openai", name: "ChatGPT", category: "subscription", aliases: ["openai", "chatgpt", "chat gpt"] },
  { id: "storytel", name: "Storytel", category: "subscription", aliases: ["Storytel"] },
  { id: "audioteka", name: "Audioteka", category: "subscription", aliases: ["Audioteka"] },
  { id: "legimi", name: "Legimi", category: "subscription", aliases: ["Legimi"] },
  { id: "player", name: "Player.pl", category: "subscription", aliases: ["Player.pl", "player pl", "tvn player"] },
  { id: "polsat_box", name: "Polsat Box Go", category: "subscription", aliases: ["Polsat Box", "polsat box go", "ipla", "cyfrowy polsat"] },
  // payment_method
  { id: "blik", name: "BLIK", category: "payment_method", aliases: ["BLIK", "blik payment"] },
  { id: "apple_pay", name: "Apple Pay", category: "payment_method", aliases: ["Apple Pay", "applepay"] },
  { id: "google_pay", name: "Google Pay", category: "payment_method", aliases: ["Google Pay", "gpay"] },
  { id: "paypal", name: "PayPal", category: "payment_method", aliases: ["PayPal"] },
  // payments
  { id: "bluemedia", name: "Blue Media", category: "payments", aliases: ["Blue Media"] },
  { id: "przelewy24", name: "Przelewy24", category: "payments", aliases: ["Przelewy24", "przelewy 24", "p24"] },
  { id: "payu", name: "PayU", category: "payments", aliases: ["PayU", "payu sa"] },
  { id: "tpay", name: "Tpay", category: "payments", aliases: ["Tpay", "tpay.com"] },
  // banking
  { id: "revolut", name: "Revolut", category: "banking", aliases: ["Revolut"] },
  { id: "wise", name: "Wise", category: "banking", aliases: ["=wise", "wise payments", "transferwise", "wise.com"] },
  { id: "pko_bp", name: "PKO Bank Polski", category: "banking", aliases: ["PKO BP", "pko bank polski", "=pko", "ipko"] },
  { id: "mbank", name: "mBank", category: "banking", aliases: ["mBank", "mbank sa"] },
  { id: "ing", name: "ING Bank Śląski", category: "banking", aliases: ["ING Bank Śląski", "ING Bank", "ing bank slaski", "=ing"] },
  { id: "santander", name: "Santander", category: "banking", aliases: ["Santander", "santander bank polska"] },
  { id: "pekao", name: "Bank Pekao", category: "banking", aliases: ["Pekao", "bank pekao", "pekao sa"] },
  { id: "millennium", name: "Bank Millennium", category: "banking", aliases: ["Bank Millennium", "millennium bank"] },
  // added from the family's logo collage
  { id: "ceneo", name: "Ceneo", category: "marketplace", aliases: ["Ceneo", "ceneo.pl"] },
  { id: "veolia", name: "Veolia", category: "utilities", aliases: ["Veolia", "veolia energia"] },
  { id: "upc", name: "UPC", category: "telecom", aliases: ["UPC Polska", "=upc"] },
  { id: "adobe", name: "Adobe", category: "subscription", aliases: ["Adobe", "adobe systems"] },
  { id: "icloud", name: "iCloud", category: "subscription", aliases: ["iCloud", "icloud storage"] },
  { id: "fedex", name: "FedEx", category: "delivery", aliases: ["FedEx", "fedex express"] },
  { id: "gls", name: "GLS", category: "delivery", aliases: ["GLS Poland", "=gls"] },
  { id: "orlen_paczka", name: "Orlen Paczka", category: "delivery", aliases: ["Orlen Paczka", "orlenpaczka"] },
  { id: "pocztex", name: "Pocztex", category: "delivery", aliases: ["Pocztex"] },
  { id: "allegro_one", name: "Allegro One", category: "delivery", aliases: ["Allegro One", "allegro one box"] },
  { id: "enter_air", name: "Enter Air", category: "travel", aliases: ["Enter Air", "enterair"] },
  { id: "funnow", name: "FunnNow", category: "entertainment", aliases: ["FunnNow", "funnow"] },
  { id: "energylandia", name: "Energylandia", category: "entertainment", aliases: ["Energylandia"] },
  { id: "bnp_paribas", name: "BNP Paribas", category: "banking", aliases: ["BNP Paribas", "bnp paribas bank polska"] },
];
