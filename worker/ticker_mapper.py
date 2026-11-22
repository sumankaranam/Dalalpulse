"""
DalalPulse: NSE Ticker & Retail Slang Mapper
Resolves official NSE symbols and popular Indian retail nicknames/aliases,
with precision word-boundary matching and false-positive word rejection.
"""

import re
from typing import Dict, List, Set, Tuple, Optional
from pathlib import Path

# Popular Indian retail market aliases and colloquial terms mapped to official NSE symbol
RETAIL_ALIASES: Dict[str, str] = {
    # Conglomerates & Auto
    "ril": "RELIANCE",
    "reliance": "RELIANCE",
    "tamo": "TATAMOTORS",
    "tata motors": "TATAMOTORS",
    "tatamotors": "TATAMOTORS",
    "tatatech": "TATATECH",
    "tata tech": "TATATECH",
    "tatapower": "TATAPOWER",
    "tata power": "TATAPOWER",
    "tatasteel": "TATASTEEL",
    "tata steel": "TATASTEEL",
    "maruti": "MARUTI",
    "maruti suzuki": "MARUTI",
    "m&m": "M&M",
    "mnm": "M&M",
    "mahindra": "M&M",
    "bajaj auto": "BAJAJ-AUTO",
    "eicher": "EICHERMOT",
    "tvs": "TVSMOTOR",
    "tvs motor": "TVSMOTOR",
    "hero moto": "HEROMOTOCO",
    "heromotoco": "HEROMOTOCO",

    # Banking & Financials
    "hdfc": "HDFCBANK",
    "hdfc bank": "HDFCBANK",
    "hdfcbank": "HDFCBANK",
    "icici": "ICICIBANK",
    "icicibank": "ICICIBANK",
    "icici bank": "ICICIBANK",
    "sbi": "SBIN",
    "sbin": "SBIN",
    "state bank": "SBIN",
    "kotak": "KOTAKBANK",
    "kotak bank": "KOTAKBANK",
    "axis": "AXISBANK",
    "axis bank": "AXISBANK",
    "indusind": "INDUSINDBK",
    "bajaj finance": "BAJFINANCE",
    "bajfinance": "BAJFINANCE",
    "bajfin": "BAJFINANCE",
    "bajaj finserv": "BAJAJFINSV",
    "jio fin": "JIOFIN",
    "jio financial": "JIOFIN",
    "jfsl": "JIOFIN",
    "jiofin": "JIOFIN",
    "pnb": "PNB",
    "bob": "BANKBARODA",
    "bank of baroda": "BANKBARODA",
    "idfc first": "IDFCFIRSTB",
    "idfcfirstb": "IDFCFIRSTB",
    "yes bank": "YESBANK",
    "yesbank": "YESBANK",

    # IT & Tech
    "infy": "INFY",
    "infosys": "INFY",
    "tcs": "TCS",
    "wipro": "WIPRO",
    "hcl tech": "HCLTECH",
    "hcltech": "HCLTECH",
    "tech mahindra": "TECHM",
    "techm": "TECHM",
    "l&t": "LT",
    "lnt": "LT",
    "larsentoubro": "LT",
    "ltim": "LTIM",
    "ltimindtree": "LTIM",
    "persistent": "PERSISTENT",
    "coforge": "COFORGE",
    "kpit": "KPITTECH",
    "kpit tech": "KPITTECH",
    "tata elxsi": "TATAELXSI",
    "elxsi": "TATAELXSI",

    # PSUs, Defense & Railways
    "irfc": "IRFC",
    "rvnl": "RVNL",
    "irctc": "IRCTC",
    "ircon": "IRCON",
    "railwire": "RAILTEL",
    "railtel": "RAILTEL",
    "hal": "HAL",
    "hindustan aeronautics": "HAL",
    "bel": "BEL",
    "bharat electronics": "BEL",
    "mazagon": "MAZDOCK",
    "mazdock": "MAZDOCK",
    "cochin shipyard": "COCHINSHIP",
    "cochinship": "COCHINSHIP",
    "bhel": "BHEL",
    "nhpc": "NHPC",
    "sjvn": "SJVN",
    "ireda": "IREDA",
    "pfc": "PFC",
    "rec": "RECLTD",
    "recltd": "RECLTD",
    "ntpc": "NTPC",
    "powergrid": "POWERGRID",
    "coal india": "COALINDIA",
    "ongc": "ONGC",
    "oil": "OIL",
    "gail": "GAIL",
    "bse": "BSE",
    "cdsl": "CDSL",
    "cams": "CAMS",

    # New-Age, Consumer & Retail Favorites
    "zomato": "ZOMATO",
    "swiggy": "SWIGGY",
    "paytm": "PAYTM",
    "one97": "PAYTM",
    "nykaa": "NYKAA",
    "fsn": "NYKAA",
    "mamaearth": "HONASA",
    "honasa": "HONASA",
    "ola electric": "OLAELEC",
    "ola": "OLAELEC",
    "olaelec": "OLAELEC",
    "suzlon": "SUZLON",
    "itc": "ITC",
    "titan": "TITAN",
    "trent": "TRENT",
    "asian paints": "ASIANPAINT",
    "asian paint": "ASIANPAINT",
    "asianpaint": "ASIANPAINT",
    "berger": "BERGEPAINT",
    "pidilite": "PIDILITIND",
    "polycab": "POLYCAB",
    "havells": "HAVELLS",
    "dixon": "DIXON",
    "dixon tech": "DIXON",
    "amber": "AMBER",
    "vedanta": "VEDL",
    "vedl": "VEDL",
    "jsw steel": "JSWSTEEL",
    "hindalco": "HINDALCO",
    "sun pharma": "SUNPHARMA",
    "sunpharma": "SUNPHARMA",
    "dr reddy": "DRREDDY",
    "drreddy": "DRREDDY",
    "cipla": "CIPLA",
    "divis": "DIVISLAB",
    "lupin": "LUPIN",
    "mankind": "MANKIND",
    "deepak nitrite": "DEEPAKNTR",
    "deepakntr": "DEEPAKNTR",
}

# Common English words that happen to be valid NSE symbols but trigger massive false positives
# when used as bare words without $ or stock context.
AMBIGUOUS_TICKERS: Set[str] = {
    "IT", "BE", "ALL", "AT", "ON", "FOR", "ARE", "CAN", "NEW", "NOW", "SEE",
    "CAR", "BIG", "KEY", "BEST", "TRUE", "IDEA", "GOOD", "AIR", "GAIN", "GOLD",
    "SILVER", "OIL", "GAS", "CARE", "FAST", "GO", "HUB", "LOT", "ME", "ONE",
    "OUT", "RUN", "SET", "TOP", "WIN", "YES", "RAM", "STAR", "TEAM", "NET",
    "TIME", "MAX", "MID", "LINK", "NEXT", "LINE", "PAY", "ROAD", "PURE", "REAL"
}

# Core Nifty 500 ticker to company name mapping
NSE_COMPANY_NAMES: Dict[str, str] = {
    "RELIANCE": "Reliance Industries Limited",
    "TCS": "Tata Consultancy Services Limited",
    "HDFCBANK": "HDFC Bank Limited",
    "INFY": "Infosys Limited",
    "ICICIBANK": "ICICI Bank Limited",
    "BHARTIARTL": "Bharti Airtel Limited",
    "SBIN": "State Bank of India",
    "LICI": "Life Insurance Corporation of India",
    "ITC": "ITC Limited",
    "HINDUNILVR": "Hindustan Unilever Limited",
    "LT": "Larsen & Toubro Limited",
    "BAJFINANCE": "Bajaj Finance Limited",
    "HCLTECH": "HCL Technologies Limited",
    "MARUTI": "Maruti Suzuki India Limited",
    "SUNPHARMA": "Sun Pharmaceutical Industries Limited",
    "TATAMOTORS": "Tata Motors Limited",
    "ONGC": "Oil & Natural Gas Corporation Limited",
    "NTPC": "NTPC Limited",
    "KOTAKBANK": "Kotak Mahindra Bank Limited",
    "TITAN": "Titan Company Limited",
    "ADANIENT": "Adani Enterprises Limited",
    "AXISBANK": "Axis Bank Limited",
    "POWERGRID": "Power Grid Corporation of India Limited",
    "TATAPOWER": "Tata Power Company Limited",
    "TATASTEEL": "Tata Steel Limited",
    "COALINDIA": "Coal India Limited",
    "ASIANPAINT": "Asian Paints Limited",
    "BAJAJFINSV": "Bajaj Finserv Limited",
    "ADANIPORTS": "Adani Ports and Special Economic Zone Limited",
    "ZOMATO": "Zomato Limited",
    "SWIGGY": "Swiggy Limited",
    "TRENT": "Trent Limited",
    "HAL": "Hindustan Aeronautics Limited",
    "BEL": "Bharat Electronics Limited",
    "BSE": "BSE Limited",
    "CDSL": "Central Depository Services (India) Limited",
    "SUZLON": "Suzlon Energy Limited",
    "IRFC": "Indian Railway Finance Corporation Limited",
    "RVNL": "Rail Vikas Nigam Limited",
    "IRCTC": "Indian Railway Catering and Tourism Corporation Limited",
    "JIOFIN": "Jio Financial Services Limited",
    "PAYTM": "One97 Communications (Paytm) Limited",
    "OLAELEC": "Ola Electric Mobility Limited",
    "VEDL": "Vedanta Limited",
    "JSWSTEEL": "JSW Steel Limited",
    "HINDALCO": "Hindalco Industries Limited",
    "DIXON": "Dixon Technologies (India) Limited",
    "POLYCAB": "Polycab India Limited",
    "MAZDOCK": "Mazagon Dock Shipbuilders Limited",
    "COCHINSHIP": "Cochin Shipyard Limited",
    "IREDA": "Indian Renewable Energy Development Agency Limited",
    "NHPC": "NHPC Limited",
    "SJVN": "SJVN Limited",
    "DEEPAKNTR": "Deepak Nitrite Limited",
    "KPITTECH": "KPIT Technologies Limited",
    "TATATECH": "Tata Technologies Limited",
    "HONASA": "Honasa Consumer (Mamaearth) Limited",
    "NYKAA": "FSN E-Commerce Ventures (Nykaa) Limited",
    "YESBANK": "Yes Bank Limited",
    "IDFCFIRSTB": "IDFC First Bank Limited",
    "PNB": "Punjab National Bank",
    "BANKBARODA": "Bank of Baroda",
    "TECHM": "Tech Mahindra Limited",
    "WIPRO": "Wipro Limited",
    "LTIM": "LTIMindtree Limited",
    "CIPLA": "Cipla Limited",
    "DRREDDY": "Dr. Reddy's Laboratories Limited",
    "DIVISLAB": "Divi's Laboratories Limited",
    "LUPIN": "Lupin Limited",
    "MANKIND": "Mankind Pharma Limited",
    "PIDILITIND": "Pidilite Industries Limited",
    "HAVELLS": "Havells India Limited",
    "AMBER": "Amber Enterprises India Limited",
    "BERGEPAINT": "Berger Paints India Limited",
    "EICHERMOT": "Eicher Motors Limited",
    "TVSMOTOR": "TVS Motor Company Limited",
    "HEROMOTOCO": "Hero MotoCorp Limited",
    "BAJAJ-AUTO": "Bajaj Auto Limited",
    "CAMS": "Computer Age Management Services Limited",
    "RECLTD": "REC Limited",
    "PFC": "Power Finance Corporation Limited",
    "BHEL": "Bharat Heavy Electricals Limited",
    "GAIL": "GAIL (India) Limited",
    "OIL": "Oil India Limited"
}

class TickerMapper:
    def __init__(self, custom_equity_file: Optional[str] = None):
        self.symbols: Set[str] = set(NSE_COMPANY_NAMES.keys())
        self.aliases: Dict[str, str] = {k.lower(): v for k, v in RETAIL_ALIASES.items()}
        self.company_names: Dict[str, str] = dict(NSE_COMPANY_NAMES)
        self.ambiguous_tickers: Set[str] = set(AMBIGUOUS_TICKERS)
        
        # Load default or custom EQUITY_L.csv if available
        equity_file = custom_equity_file or (Path(__file__).resolve().parent / "EQUITY_L.csv")
        if Path(equity_file).exists():
            self._load_equity_csv(str(equity_file))

        # Build regex patterns
        # 1. Exact Cashtags: $TICKER or #TICKER
        self.cashtag_pattern = re.compile(r'[$#]([A-Za-z0-9\-&]+)\b')
        
        # 2. Stocktwits tags: [SYMBOL.NSE] or SYMBOL.NSE
        self.stocktwits_tag_pattern = re.compile(r'\[?([A-Za-z0-9\-&]+)\.(?:NSE|BSE)\]?', re.IGNORECASE)

        # 3. Uppercase symbols (word boundary, 3-14 chars)
        self.uppercase_symbol_pattern = re.compile(r'\b([A-Z]{3,14}(?:-[A-Z0-9]+)?)\b')

    def _load_equity_csv(self, file_path: str):
        """Parses NSE EQUITY_L.csv to expand symbols and company name aliases."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                for line in lines[1:]:
                    parts = line.split(",")
                    if len(parts) >= 2:
                        sym = parts[0].strip().upper()
                        name = parts[1].strip()
                        if sym:
                            self.symbols.add(sym)
                            if sym not in self.company_names:
                                self.company_names[sym] = name
                            
                            # Clean company name into an alias
                            # e.g. "Zaggle Prepaid Ocean Services Limited" -> "zaggle prepaid", "zaggle"
                            clean_name = re.sub(r'\b(limited|ltd|industries|india|corp|corporation)\b', '', name, flags=re.IGNORECASE).strip()
                            clean_lower = clean_name.lower().strip()
                            if len(clean_lower) >= 4 and clean_lower not in self.aliases:
                                self.aliases[clean_lower] = sym
                            
                            first_word = clean_lower.split()[0] if clean_lower else ""
                            if len(first_word) >= 5 and first_word not in self.aliases and first_word.upper() not in self.ambiguous_tickers:
                                self.aliases[first_word] = sym
        except Exception as e:
            print(f"[ticker_mapper] Notice: Could not read custom equity CSV: {e}")

    def get_company_name(self, ticker: str) -> str:
        return self.company_names.get(ticker.upper(), f"{ticker} Limited")

    def extract_tickers(self, text: str) -> List[Tuple[str, str]]:
        """
        Extracts detected NSE tickers from raw text.
        Returns a list of tuples: (official_symbol, matched_token)
        """
        if not text:
            return []

        detected: List[Tuple[str, str]] = []
        text_lower = text.lower()

        # Step 1: Detect Stocktwits tags ([MARUTI.NSE], BAJFINANCE.NSE)
        for match in self.stocktwits_tag_pattern.finditer(text):
            token = match.group(1).upper()
            if token in self.symbols or token.lower() in self.aliases:
                sym = token if token in self.symbols else self.aliases[token.lower()]
                detected.append((sym, match.group(0)))

        # Step 2: Detect explicit Cashtags ($RELIANCE, #INFY, $ITC)
        for match in self.cashtag_pattern.finditer(text):
            token = match.group(1).upper()
            if token.endswith(".NSE") or token.endswith(".BSE"):
                token = token.split(".")[0]
            if token in self.symbols or token.lower() in self.aliases:
                sym = token if token in self.symbols else self.aliases[token.lower()]
                detected.append((sym, match.group(0)))

        # Step 3: Multi-word & single-word alias matching (e.g. 'tata motors', 'ril', 'jio fin')
        for alias, symbol in sorted(self.aliases.items(), key=lambda x: len(x[0]), reverse=True):
            if len(alias) < 3:
                continue
            pattern = rf'\b{re.escape(alias)}\b'
            if re.search(pattern, text_lower):
                detected.append((symbol, alias))

        # Step 4: Uppercase ticker tokens (e.g. INFY, ZOMATO, TCS, SUZLON)
        for match in self.uppercase_symbol_pattern.finditer(text):
            token = match.group(1)
            # Skip common English words unless matched via cashtags or alias
            if token in self.ambiguous_tickers:
                continue
            if token in self.symbols:
                detected.append((token, token))

        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for sym, token in detected:
            if sym not in seen:
                seen.add(sym)
                deduped.append((sym, token))

        return deduped

if __name__ == "__main__":
    mapper = TickerMapper()
    sample = "Looks like $RIL and TaMo are breaking out today! Also watching ZOMATO and IRFC for a swing, but avoid IT stocks."
    results = mapper.extract_tickers(sample)
    print("Detected tickers in sample:")
    for sym, token in results:
        print(f" - {sym} ({mapper.get_company_name(sym)}) matched via '{token}'")
