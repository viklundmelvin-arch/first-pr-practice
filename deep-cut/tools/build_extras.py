"""Build the EXTRA answer tables for Deep Cut from downloaded datasets + hand lists.

Entry format: "Name|pct|alias,alias" (pct and aliases optional; pct defaults per round).
Output: a JS snippet `const EXTRA = {...}` written to extras.js.
"""
import csv, json, re, sys, unicodedata
from pathlib import Path

DL = Path(sys.argv[1])
OUT = Path(sys.argv[2])

def clean(s):
    return re.sub(r"\s+", " ", s.replace("|", " ").replace(";", " ")).strip()

def split_hand(s):
    return [e.strip() for e in s.replace("\n", " ").split(";") if e.strip()]

def ent(name, pct=None, aliases=()):
    al = ",".join(clean(a).replace(",", " ") for a in aliases if a and clean(a))
    out = clean(name)
    if pct is not None or al:
        out += "|" + ("" if pct is None else str(pct))
    if al:
        out += "|" + al
    return out

# ---------------- Pokémon (PokéAPI, all 1025 species) ----------------
poke = []
for r in csv.DictReader(open(DL / "poke_names.csv", encoding="utf-8")):
    if r["local_language_id"] != "9":
        continue
    i = int(r["pokemon_species_id"])
    pct = 0.3 if i <= 151 else 0.12 if i <= 493 else 0.06
    name = r["name"].replace("♀", " female").replace("♂", " male")
    aliases = []
    if "female" in name:
        aliases.append("nidoran")
    poke.append(ent(name, pct, aliases))

# ---------------- Minecraft mobs (PrismarineJS minecraft-data, latest) ----------------
mc = []
for e in json.load(open(DL / "mc_entities.json")):
    if e.get("type") in ("mob", "hostile", "passive", "animal", "water_creature", "ambient", "living"):
        if e["displayName"] in ("Armor Stand", "Mannequin"):
            continue
        mc.append(ent(e["displayName"], 0.06))
mc += split_hand("Killer Bunny|0.02|killer rabbit;Chicken Jockey|0.02;Spider Jockey|0.02;Skeleton Horseman|0.02|skeleton trap;"
                 "Ender Crystal|0.02|end crystal;Agent|0.01|education edition agent;NPC|0.01;Rana|0.01;Steve|0.03;Alex|0.02;"
                 "Moobloom|0.02;Glare|0.02;Iceologer|0.02|chillager;Copper Golem|0.05;Tuff Golem|0.01;Crab|0.02|minecraft crab;"
                 "Penguin|0.01;Ghast Ling|0.01|ghastling;Wildfire|0.01;Rascal|0.01;Herobrine|0.02")

# ---------------- Countries (mledoze/countries) ----------------
countries = []
for c in json.load(open(DL / "countries.json", encoding="utf-8")):
    name = c["name"]["common"]
    al = [c["name"]["official"]] + [a for a in c.get("altSpellings", []) if len(a) >= 4]
    pct = 0.08 if c.get("unMember") else 0.03
    countries.append(ent(name, pct, al))
countries += split_hand("Vatican City|0.05|holy see,vatican;Kosovo|0.06;Taiwan|0.1|republic of china;Palestine|0.08|state of palestine;"
                        "Western Sahara|0.03|sahrawi republic;Northern Cyprus|0.02;Somaliland|0.02;Abkhazia|0.01;Transnistria|0.01;South Ossetia|0.01;"
                        "Scotland|0.15;Wales|0.08;Northern Ireland|0.05;Greenland|0.08;Czechia|0.1|czech republic;North Macedonia|0.05|macedonia;"
                        "Myanmar|0.06|burma;Ivory Coast|0.05|cote divoire;Cape Verde|0.03|cabo verde;Sealand|0.01|principality of sealand")

# ---------------- Animals (corpora + skjorrface/animals.txt + hzlzh word list) ----------------
animals = []
common = json.load(open(DL / "corp_animals_common.json"))["animals"]
for a in common:
    animals.append(ent(a.title(), 0.2))
for a in json.load(open(DL / "corp_animals_collateral_adjectives.json"))["animals"]:
    animals.append(ent(a["name"].title(), 0.1))
for line in open(DL / "an_animals.txt", encoding="utf-8"):
    if line.strip():
        animals.append(ent(line.strip(), 0.05))
for line in open(DL / "an_Animal-words.txt", encoding="utf-8"):
    w = line.strip()
    if w and w.isalpha():
        animals.append(ent(w.title(), 0.08))

# ---------------- Fruit (corpora + hand) ----------------
fruit = [ent(f.title(), 0.08) for f in json.load(open(DL / "corp_foods_fruits.json"))["fruits"]]
fruit += split_hand("""Acerola|0.03|barbados cherry;Acai|0.06|acai berry;Bilberry;Breadfruit;Boysenberry;Blood Orange|0.1;Calamansi|0.03|calamondin;
Cempedak|0.02;Citron|0.03|etrog;Crab Apple|0.05;Currant|0.05;Blackcurrant|0.05;Redcurrant|0.04|red currant;Damson|0.02;Dewberry|0.02;Duku|0.01;
Finger Lime|0.02;Goji Berry|0.04|goji,wolfberry;Hala Fruit|0.01|hala;Horned Melon|0.02|kiwano;Huckleberry|0.05;Jambul|0.01|java plum;Jostaberry|0.01;
Juniper Berry|0.02;Kiwi Berry|0.02|hardy kiwi;Langsat|0.01;Lucuma|0.02;Mamey Sapote|0.02|mamey;Marionberry|0.02;Monstera Deliciosa|0.01|monstera;
Mulberry|0.08;Nance|0.01;Noni|0.02;Olive|0.05;Pepino|0.02|pepino melon;Pitanga|0.01|surinam cherry;Plantain|0.06;Prickly Pear|0.04|cactus pear,tuna fruit;
Prune|0.03;Pulasan|0.01;Rose Hip|0.02|rosehip;Rowan|0.01|rowanberry;Salmonberry|0.01;Santol|0.01;Satsuma|0.04;Sea Buckthorn|0.01;Serviceberry|0.01|saskatoon,juneberry;
Sloe|0.02;Strawberry Guava|0.01;Sugar Apple|0.02|sweetsop;Tamarillo|0.02|tree tomato;White Sapote|0.01;Yangmei|0.01|yumberry,bayberry;Bael|0.01;Bignay|0.01;
Black Sapote|0.01|chocolate pudding fruit;Canistel|0.01|eggfruit;Cocona|0.01;Gac|0.01|gac fruit;Mamoncillo|0.01|genip,spanish lime;Ilama|0.01;Jujube|0.03|red date;
Maqui|0.01;Mayhaw|0.01;Naranjilla|0.01|lulo;Pequi|0.01;Biriba|0.01;Safou|0.01|african pear;Bergamot|0.02;Buddha's Hand|0.02|buddhas hand;Sudachi|0.01;Kabosu|0.01;
Dekopon|0.01|sumo citrus,sumo;Key Lime|0.04;Meyer Lemon|0.03;Tangelo|0.03;Muskmelon|0.03;Galia Melon|0.01;Casaba Melon|0.01;Crenshaw Melon|0.01;Bitter Melon|0.02|bitter gourd;
Cucumber|0.03;Pumpkin|0.03;Atemoya|0.01;Baobab|0.01;Hog Plum|0.01;Ambarella|0.01;Bilimbi|0.01;Medjool Date|0.02;Ice Cream Bean|0.01;Wax Apple|0.01|rose apple;
Velvet Tamarind|0.01;Chokeberry|0.02|aronia;Marang|0.01;Abiu|0.01;Sapote|0.02;Carob|0.01;Nectarine|0.15;Clementine|0.15;Raisin|0.05""")

# ---------------- Pizza toppings (corpora + hand) ----------------
pizza = [ent(t.title(), 0.08) for t in json.load(open(DL / "corp_foods_pizzaToppings.json"))["pizzaToppings"]]
pizza += split_hand("""Sun-dried Tomatoes|0.06|sundried tomatoes,sun dried tomato;Roasted Red Peppers|0.04;Banana Peppers|0.1;Pepperoncini|0.03;Parmesan|0.1|parmigiano;
Provolone|0.04;Cheddar|0.05;Fontina|0.02;Burrata|0.03;Buffalo Mozzarella|0.03|mozzarella di bufala;Blue Cheese|0.03;Brie|0.02;Taleggio|0.01;Pecorino|0.02;
Smoked Salmon|0.02;Crab|0.02;Lobster|0.01;Mussels|0.02;Scallops|0.01;Octopus|0.01;Caviar|0.01;Lamb|0.02;Pulled Pork|0.04;Meatballs|0.06|meatball;Pastrami|0.01;
Corned Beef|0.01;Duck|0.01;Speck|0.01;Pancetta|0.03;Capicola|0.02|capocollo,gabagool,coppa;Soppressata|0.02;Guanciale|0.01;Lardons|0.01;Spam|0.01;Hot Dogs|0.02|hot dog;
Taco Meat|0.02;Gyro|0.01;Chicken Tikka|0.02;Buffalo Chicken|0.04;Teriyaki Chicken|0.01;Bulgogi|0.01;Mayonnaise|0.01|mayo;Garlic Sauce|0.01;Caramelized Onions|0.03;
Leeks|0.01|leek;Shallots|0.01;Scallions|0.02|green onions,spring onions;Kale|0.02;Swiss Chard|0.01;Radicchio|0.01;Asparagus|0.02;Cauliflower|0.01;Butternut Squash|0.01;
Sweet Potato|0.01;Beets|0.01|beetroot;Carrots|0.01;Peas|0.01;Avocado|0.02;Cilantro|0.01|coriander;Oregano|0.04;Rosemary|0.01;Thyme|0.01;Chili Flakes|0.06|red pepper flakes,crushed red pepper;
Kalamata Olives|0.02;Green Olives|0.05;Pickled Onions|0.01;Giardiniera|0.01;Sauerkraut|0.01;Peanut Butter|0.01;Chocolate|0.02;Nutella|0.02;Marshmallows|0.01;
Strawberries|0.01;Apple|0.01;Peach|0.01;Grapes|0.01;Cherry Tomatoes|0.03;Quail Egg|0.01;Tofu|0.01;Vegan Cheese|0.01;Seitan|0.01;Tempeh|0.01;Jackfruit|0.01;
Pine Nuts|0.01;Walnuts|0.01;Pecans|0.01;Almonds|0.01;Sesame Seeds|0.01;Balsamic Glaze|0.02|balsamic;Chili Oil|0.02;Sriracha|0.02;Hot Sauce|0.03|tabasco;
Alfredo|0.02|alfredo sauce;White Sauce|0.02;Vodka Sauce|0.02;Hummus|0.01;Tzatziki|0.01;Za'atar|0.01|zaatar;Harissa|0.01;Maple Syrup|0.01;Cinnamon|0.01;
French Fries|0.02|fries,chips;Potato Chips|0.01|crisps;Doritos|0.01;Ketchup|0.01;Mustard|0.01;Coconut|0.01;Mango|0.01;Kiwi|0.01;Durian|0.01;Crickets|0.01;
Escargot|0.01|snails;Eel|0.01;Herring|0.01;Bone Marrow|0.01;Foie Gras|0.01;Haggis|0.01;Black Pudding|0.01;Bologna|0.01|baloney;Andouille|0.01;Kielbasa|0.01;
Bratwurst|0.01;Canadian Bacon|0.08|back bacon;Bacon Bits|0.02;Chili Peppers|0.04|chilies,chillies;Grilled Onions|0.02;Ground Pork|0.01;Pepper Jack|0.01;
Gouda|0.02;Smoked Gouda|0.01;Halloumi|0.01;Paneer|0.02;Chicken Wings|0.01;Popcorn Chicken|0.01;Fried Chicken|0.01;Sardines|0.02;Tomato Sauce|0.05|sauce,marinara""")

# ---------------- Sports (corpora, ~960) ----------------
sports = []
for s in json.load(open(DL / "corp_sports_sports.json"))["sports"]:
    s = re.sub(r"\s*\(.*?\)", "", s).strip()
    if s:
        sports.append(ent(s, 0.04))

# ---------------- Hand-researched gaming lists ----------------
consoles = split_hand("""Magnavox Odyssey 2|0.06|odyssey2,odyssey 2,videopac,philips videopac;Fairchild Channel F|0.04|channel f;Bally Astrocade|0.03|astrocade;RCA Studio II|0.02|studio ii,studio 2;
APF M-1000|0.01|apf mp1000;Atari 5200|0.1;Atari 7800|0.08;Atari XEGS|0.02|xegs;Emerson Arcadia 2001|0.01|arcadia 2001;Casio PV-1000|0.01|pv-1000,pv1000;
Sega SG-1000|0.03|sg-1000,sg1000;Epoch Cassette Vision|0.01|cassette vision;Super Cassette Vision|0.01;Entex Adventure Vision|0.01|adventure vision;
VTech CreatiVision|0.01|creativision;Coleco Telstar|0.02|telstar;Coleco Gemini|0.01;Interton VC 4000|0.01|vc 4000;Mattel Aquarius|0.01|aquarius;
Milton Bradley Microvision|0.02|microvision;Color TV-Game|0.02|nintendo color tv game;Famicom Disk System|0.04|disk system,fds;NEC PC-FX|0.02|pc-fx,pcfx;
SuperGrafx|0.02|pc engine supergrafx;TurboDuo|0.02|turbo duo;Neo Geo CD|0.03;Neo Geo X|0.01;Amiga CD32|0.03|cd32;Commodore CDTV|0.01|cdtv;
Commodore 64 Games System|0.01|c64gs,c64 games system;Amstrad GX4000|0.01|gx4000;Pioneer LaserActive|0.01|laseractive;Bandai Playdia|0.01|playdia;
Casio Loopy|0.01|loopy;Sega Pico|0.02|pico;VTech V.Smile|0.02|vsmile,v smile;LeapFrog Leapster|0.03|leapster;Tiger Game.com|0.02|game com,gamecom;
Tiger R-Zone|0.02|r-zone,rzone;Nuon|0.01;Sega Nomad|0.03|nomad;Nintendo 64DD|0.02|64dd;Satellaview|0.01;Sega Mega Jet|0.01|mega jet;Gamate|0.01;
Watara Supervision|0.01|supervision;Mega Duck|0.01|cougar boy;WonderSwan Color|0.02;SwanCrystal|0.01|swan crystal;Neo Geo Pocket Color|0.03|ngpc;
GP32|0.01|game park gp32;GP2X|0.01;OpenPandora|0.01|pandora;Gizmondo|0.03;Tapwave Zodiac|0.01|zodiac;N-Gage QD|0.01;PSP Go|0.05|psp go;
Pokemon Mini|0.03|pokemon mini;Game Boy Micro|0.04|gameboy micro;Game Boy Advance SP|0.1|gba sp,advance sp;Nintendo DSi|0.1|dsi;Nintendo DS Lite|0.08|ds lite;
New Nintendo 3DS|0.04|new 3ds;Nintendo 2DS|0.1|2ds,new 2ds xl;Nintendo Switch Lite|0.3|switch lite;Nintendo Switch OLED|0.2|switch oled;PlayStation Portal|0.08|ps portal;
PlayStation 5 Pro|0.1|ps5 pro;PlayStation 4 Pro|0.06|ps4 pro;Xbox One X|0.1;Xbox One S|0.08;Mattel HyperScan|0.01|hyperscan;XaviXPORT|0.01|xavix;Zeebo|0.01;
GameStick|0.01|playjam gamestick;Nvidia Shield|0.04|shield tv,nvidia shield tv;Atari VCS|0.02|atari vcs 2021;Intellivision Amico|0.02|amico;Polymega|0.01;
Evercade VS|0.01;Evercade EXP|0.01;Analogue Duo|0.01;Analogue Mega Sg|0.01|mega sg;Analogue Super Nt|0.01|super nt;Analogue 3D|0.02;RetroN 5|0.01|retron;
Ayaneo|0.02|aya neo;ROG Ally|0.1|asus rog ally,rog ally x;Legion Go|0.05|lenovo legion go;MSI Claw|0.02;Anbernic|0.03|anbernic rg35xx;Miyoo Mini|0.02|miyoo;
Steam Machine|0.08;Google Stadia|0.15|stadia;Amazon Luna|0.02|luna;OnLive|0.02;VTech Socrates|0.01|socrates;Action Max|0.01|worlds of wonder action max;
View-Master Interactive Vision|0.01;Sega Mark III|0.01|mark iii;Twin Famicom|0.01;Sharp C1|0.01|famicom tv;Dendy|0.02;Polystation|0.02;Super Game Boy|0.03;
Nintendo PlayStation|0.03|snes cd,playstation prototype,snes playstation;Meta Quest|0.15|oculus quest,quest 2,quest 3;Oculus Rift|0.05|rift;Valve Index|0.02;
Apple Vision Pro|0.03|vision pro;Wii Mini|0.02;Game & Watch|0.15|game and watch;Dreamcast VMU|0.01|vmu;PocketStation|0.01|pocket station;
Neo Geo AES|0.03|aes;Neo Geo MVS|0.02|mvs;Atari Flashback|0.02;NES Classic Edition|0.08|nes classic,nes mini;SNES Classic|0.05|snes mini,snes classic edition;
PlayStation Classic|0.03|ps classic;Sega Genesis Mini|0.02|mega drive mini;TurboGrafx-16 Mini|0.01|pc engine mini;TheC64 Mini|0.01|c64 mini;Atari 2600+|0.01|atari 2600 plus;
Arduboy|0.01;Thumby|0.01;Retroid Pocket|0.01;AYN Odin|0.01|odin;GPD Win|0.01;Steam Deck OLED|0.05;Xbox Series S|0.5;Wii Family Edition|0.01;
Sega Saturn|0.2;Sega Neptune|0.01;Atari Lynx II|0.01;Atari Jaguar CD|0.01;Sega CDX|0.01|cdx;PlayStation 2 Slim|0.02|ps2 slim;PSone|0.03|ps one slim;
Nintendo Wii U|0.4;Virtual Boy|0.15;Hyperkin Retron|0.01;Commodore 64|0.05|c64;ZX Spectrum|0.03|spectrum;Amiga|0.04|commodore amiga;MSX|0.02;
Sharp X68000|0.01|x68000;FM Towns Marty|0.01|fm towns;NEC PC-88|0.01|pc-88;Apple II|0.01;Atari ST|0.01;Atari 400|0.01;Atari 800|0.01;Intellivision II|0.01;
Bandai Super Vision 8000|0.01;Hanimex Pencil II|0.01;Sord M5|0.01;Tomy Tutor|0.01;Epoch Game Pocket Computer|0.01;Nintendo Switch 2|5|switch 2""")

nintendo = split_hand("""Goomba|0.3;Koopa Troopa|0.2|koopa;Bob-omb|0.08|bobomb;Boo|0.2;Dry Bones|0.15;Chain Chomp|0.1;Piranha Plant|0.1;Bullet Bill|0.06;Hammer Bro|0.05|hammer bros;
Blooper|0.03;Cheep Cheep|0.03;Thwomp|0.05;Whomp|0.02;Wiggler|0.03;Pokey|0.02;Monty Mole|0.02;Magikoopa|0.02;Koopalings|0.04|koopaling;Larry Koopa|0.02|larry;
Morton Koopa Jr.|0.02|morton;Wendy O. Koopa|0.02|wendy;Iggy Koopa|0.02|iggy;Roy Koopa|0.02;Lemmy Koopa|0.02|lemmy;Ludwig von Koopa|0.02|ludwig;Bowser Jr.|0.2|bowser jr;
Dry Bowser|0.03;Baby Mario|0.05;Baby Luigi|0.03;Baby Peach|0.02;Baby Daisy|0.02;Baby Rosalina|0.01;Toadette|0.08;Nabbit|0.02;Cappy|0.05;Pianta|0.01;Noki|0.01;
Fawful|0.03;Cackletta|0.01;Geno|0.03;Mallow|0.02;Smithy|0.01;Kooper|0.01;Goombario|0.01;Bombette|0.01;Parakarry|0.01;Lady Bow|0.01;Watt|0.01;Sushie|0.01;
Lakilester|0.01;Vivian|0.02;Count Bleck|0.02;Dimentio|0.02;Mimi|0.01;O'Chunks|0.01|ochunks;Tippi|0.01;Lubba|0.01;Polari|0.01;Luma|0.03;Dr. Mario|0.05|dr mario;
Metal Mario|0.02;Pink Gold Peach|0.02;Pom Pom|0.01;Boom Boom|0.02;Kammy Koopa|0.01;Mouser|0.01;Tryclyde|0.01;Fryguy|0.01;Clawgrip|0.01;Toadbert|0.01;
Professor Frankly|0.01;Goombella|0.02;Flurrie|0.01;Ms. Mowz|0.01|ms mowz;Admiral Bobbery|0.01|bobbery;Prince Peasley|0.01;Popple|0.01;Starlow|0.01;Broque Monsieur|0.01;
Plessie|0.01;Captain Syrup|0.02;9-Volt|0.02|nine volt;18-Volt|0.01;Kat & Ana|0.01|kat,ana;Dribble & Spitz|0.01|dribble,spitz;Dr. Crygor|0.01;Penny Crygor|0.01;Orbulon|0.01;
Young Cricket|0.01;Master Mantis|0.01;5-Volt|0.01;Red|0.01;Candy Kong|0.02;Swanky Kong|0.01;Wrinkly Kong|0.01;Kiddy Kong|0.02;Lanky Kong|0.02;Tiny Kong|0.02;
Chunky Kong|0.02;Rambi|0.01;Squawks|0.01;Enguarde|0.01;Expresso|0.01;Klump|0.01;Krusha|0.01;Kremling|0.02;Kaptain K. Rool|0.01|kaptain k rool;Baron K. Roolenstein|0.01;
Tiki Tong|0.01;Lord Fredrik|0.01;Impa|0.03;Sheik|0.05;Epona|0.05;Skull Kid|0.05;Fi|0.02;Ghirahim|0.03;Zant|0.03;Vaati|0.02;Ezlo|0.01;Tetra|0.03;Beedle|0.02;
Kass|0.01;Mipha|0.03;Revali|0.02;Daruk|0.02;Urbosa|0.02;Sidon|0.03|prince sidon;Riju|0.01;Yunobo|0.01;Teba|0.01;Purah|0.01;Robbie|0.01;Hestu|0.02;Korok|0.05|koroks;
Great Deku Tree|0.02|deku tree;Saria|0.02;Darunia|0.01;Ruto|0.02|princess ruto;Nabooru|0.01;Rauru|0.01;Kaepora Gaebora|0.01;Malon|0.02;Talon|0.01;Ingo|0.01;
Anju|0.01;Kafei|0.01;Tatl|0.01;Happy Mask Salesman|0.02;Groose|0.01;Linebeck|0.01;King of Red Lions|0.01;Toon Link|0.05;Young Link|0.04;Ravio|0.01;Hilda|0.01;
Yuga|0.01;Sonia|0.01;Mineru|0.01;Agahnim|0.01;Twinrova|0.01|koume,kotake;Waddle Dee|0.08;Bandana Waddle Dee|0.03;Waddle Doo|0.02;Marx|0.03;Magolor|0.03;
Taranza|0.01;Susie|0.01;Elfilin|0.01;Adeleine|0.01;Ribbon|0.01;Gooey|0.01;Rick|0.01;Kine|0.01;Coo|0.01;Dark Matter|0.02;Zero|0.01;Drawcia|0.01;Galacta Knight|0.02;
Whispy Woods|0.02;Gordo|0.01;Kracko|0.01;Daroach|0.01;Nightmare|0.01;Mother Brain|0.03;Dark Samus|0.03;Sylux|0.01;Kraid|0.02;Adam Malkovich|0.01|adam;Raven Beak|0.01;
Phantoon|0.01;Metroid|0.03;Rundas|0.01;Ghor|0.01;Gandrayda|0.01;Noxus|0.01;Wolf O'Donnell|0.03|wolf,wolf odonnell;Leon Powalski|0.01;Pigma Dengar|0.01;
Andrew Oikonny|0.01;General Pepper|0.01;ROB 64|0.01;Andross|0.03;Fara Phoenix|0.01;Fay|0.01;Miyu|0.01;Katt Monroe|0.01;Bill Grey|0.01;Samurai Goroh|0.01;
Black Shadow|0.01;Dr. Stewart|0.01;Pico|0.01;Mighty Gazelle|0.01;Jody Summer|0.01;Zoda|0.01;Mr. EAD|0.01;Roy|0.03;Lucina|0.04;Robin|0.03;Corrin|0.02;Byleth|0.02;
Chrom|0.02;Lyn|0.01;Eirika|0.01;Ephraim|0.01;Hector|0.01;Eliwood|0.01;Tiki|0.01;Edelgard|0.02;Dimitri|0.02;Claude|0.01;Alear|0.01;Sigurd|0.01;Seliph|0.01;
Micaiah|0.01;Sothe|0.01;Anna|0.01;Caeda|0.01;Celica|0.01;Alm|0.01;Camilla|0.01;Azura|0.01;Sothis|0.01;Rhea|0.01;K.K. Slider|0.08|kk slider,kk;Blathers|0.05;
Celeste|0.02;Mabel|0.01;Sable|0.01;Label|0.01;Timmy|0.02|timmy and tommy;Tommy|0.02;Mr. Resetti|0.03|resetti;Kapp'n|0.02|kappn;Digby|0.01;Pelly|0.01;Phyllis|0.01;
Pete|0.01;Gulliver|0.01;Redd|0.01|crazy redd;Katrina|0.01;Saharah|0.01;Wisp|0.01;Lyle|0.01;Brewster|0.01;Daisy Mae|0.01;Raymond|0.02;Marshal|0.01;Ankha|0.01;
Lolly|0.01;Bob|0.01;Kid Cat|0.01;Wilbur|0.01;Orville|0.01;C.J.|0.01|cj;Flick|0.01;Leif|0.01;Kicks|0.01;Harvey|0.01;Niko|0.01;Wardell|0.01;Octoling|0.03;
Callie|0.02;Marie|0.02;Pearl|0.01;Marina|0.01;Agent 3|0.01;Agent 4|0.01;Agent 8|0.01;DJ Octavio|0.01;Judd|0.01;Li'l Judd|0.01|lil judd;Sheldon|0.01;Annie|0.01;
Spyke|0.01;Big Man|0.01;Shiver|0.01;Frye|0.01;Mr. Grizz|0.01;Cap'n Cuttlefish|0.01|captain cuttlefish;Crusty Sean|0.01;Jelonzo|0.01;Louie|0.01;Alph|0.01;
Brittany|0.01;Charlie|0.01;The President|0.01|president;Captain Shepherd|0.01|shepherd;Oatchi|0.01;Moss|0.01;Pikmin|0.03;Pyra|0.03;Mythra|0.03;Rex|0.01;Fiora|0.01;
Dunban|0.01;Reyn|0.01;Melia|0.01;Riki|0.01;Noah|0.01;Mio|0.01;Palutena|0.04;Dark Pit|0.02|pittoo;Medusa|0.01;Hades|0.01;Viridi|0.01;Magnus|0.01;Paula|0.01;
Jeff|0.01;Poo|0.01;Porky|0.01|porky minch;Mr. Saturn|0.01|mr saturn;Ninten|0.01;Kumatora|0.01;Duster|0.01;Boney|0.01;Claus|0.01;Giygas|0.01;Doc Louis|0.01;
Glass Joe|0.02;King Hippo|0.02;Bald Bull|0.01;Soda Popinski|0.01;Mr. Sandman|0.01;Von Kaiser|0.01;Piston Honda|0.01;Great Tiger|0.01;Super Macho Man|0.01;
Don Flamenco|0.01;Chibi-Robo|0.02|chibi robo;Balloon Fighter|0.01;Takamaru|0.01;Mii|0.05|miis;Spring Man|0.01;Ribbon Girl|0.01;Min Min|0.02;Ninjara|0.01;
Master Mummy|0.01;Mechanica|0.01;Twintelle|0.01;Isaac|0.01;Felix|0.01;Andy|0.01;Sami|0.01;Sturm|0.01;Nell|0.01;Bayonetta|0.05;Dillon|0.01;Mach Rider|0.01;
Stanley|0.01;Jumpman|0.03;Captain Rainbow|0.01;Excitebike Rider|0.01;Mallo|0.01;Pyoro|0.01;Pauline|0.05;Spike|0.01;Shadow Queen|0.01;Antasma|0.01;Bowletta|0.01;
Sprixie Princess|0.01;Cranky Kong|0.03;Bowser's Minion|0.01;Tostarenan|0.01;Waddle Dee Army|0.01;Elephant Mario|0.02;Wonder Flower|0.01;Prince Florian|0.01;
Peashooter|0.01;Boshi|0.01;Yoshi Kid|0.01;Poochy|0.02;Squirps|0.01;Kamek|0.05;Baby Bowser|0.02;Mona|0.01;Dark Link|0.04;Fierce Deity|0.02;Tingle|0.05;
Majora|0.02;Demise|0.01;Ganon|0.05;Steve|0.01;Sora|0.01""")

battle_royale = split_hand("""Apex Legends Mobile|0.05;Call of Duty: Mobile|0.1|cod mobile,call of duty mobile;Warzone 2.0|0.1|warzone 2;Warzone Mobile|0.04;
Black Survival: Eternal Return|0.02|eternal return,black survival;Planetside Arena|0.01;Last Tide|0.01;Fear the Wolves|0.01;SOS|0.01|sos the ultimate escape;
Radical Heights|0.02;Mini Royale: Nations|0.01|mini royale;Brawl Stars|0.1|brawl stars showdown;Paladins: Battlegrounds|0.01|paladins battlegrounds;
PUBG: New State|0.03|new state;Sausage Man|0.02;Creative Destruction|0.02;Free Fire Max|0.05;Hearthstone Battlegrounds|0.02;Super Bomberman R Online|0.02;
Hopeless Land|0.01|hopeless land fight for survival;Survivor Royale|0.01;Zombs Royale|0.05|zombsroyale io,zombsroyale;Surviv.io|0.05|surviv io,survivio;
Red Dead Online Gun Rush|0.01|gun rush;Danger Zone|0.1|cs go danger zone,counter strike danger zone;Island Royale|0.01;Mario Kart World Knockout Tour|0.03|knockout tour;
Battlegrounds Mobile India|0.03|bgmi;Fortnite Reload|0.08|reload;Fortnite Zero Build|0.08|zero build;Apex Legends Revelry|0.01;Splitgate Arena Reloaded|0.01;
Spellbreak|0.3;Battlefield 2042 Battle Royale|0.02;Battlefield 6 REDSEC|0.05|redsec,battlefield redsec;Super Animal Royale|0.2;Stumble Guys|0.6;
Minecraft Battle|0.01;Tetris 99|0.4;Galaxy Squad|0.01;Rumbleverse|0.1;Darwin Project|0.15;Vampire The Masquerade Bloodhunt|0.02;Spectre Divide|0.01;
Moonbreaker|0.01;Delta Force|0.02|delta force hawk ops;Arena Breakout|0.02;Garena Speed Drifters|0.01;Fishbowl|0.01;Battle Royale Simulator|0.01;
Maelstrom|0.01;Notruf|0.01;Royale High|0.01;Paladins|0.01;Blackout 2|0.01;The Culling 2|0.01;Dead by Daylight|0.01;Rec Room Battle Royale|0.01;
Roblox Strucid|0.01|strucid;Island Troll Tribes|0.01;Battlerite Royale|0.03;Ark Survival of the Fittest|0.03;H1Z1 King of the Kill|0.05|king of the kill""")

weapons = split_hand("""Oathkeeper|0.05;Oblivion|0.03;Kingdom Key|0.1;Soul Edge|0.03;Soul Calibur|0.03|soulcalibur;Monado|0.08;Falchion|0.05;Ragnell|0.03;Binding Blade|0.02|sword of seals;
Excalibur|0.1;Murasama|0.05;Muramasa|0.05;Durandal|0.02;Gae Bolg|0.01;Zantetsuken|0.01;Biggoron's Sword|0.05|biggorons sword;Kokiri Sword|0.08;Fierce Deity Sword|0.02;
Goddess Sword|0.03;Four Sword|0.02;Gilded Sword|0.01;Megaton Hammer|0.03;Ball and Chain|0.01;Spinner|0.01;Lightsaber|0.1;Gravity Hammer|0.1;Spartan Laser|0.08;
Battle Rifle|0.08|br55,br;Assault Rifle|0.05|ma5,ma5b;Magnum|0.03;Sniper Rifle|0.05;Fuel Rod Gun|0.03|fuel rod cannon;Plasma Pistol|0.05;Brute Shot|0.02;Spiker|0.01;
Mauler|0.01;Covenant Carbine|0.02|carbine;Beam Rifle|0.02;Sentinel Beam|0.01;Incineration Cannon|0.01;Gauss Rifle|0.04;Super Shotgun|0.2;Chainsaw|0.2;Plasma Gun|0.05;
Unmaker|0.03;Crucible|0.03|crucible blade;Chaingun|0.05;BFG 10K|0.02;Nailgun|0.03|nail gun;Super Nailgun|0.01;Gluon Gun|0.02|egon;Tau Cannon|0.02|gauss gun;
Hivehand|0.01|hive hand;Snark|0.02|snarks;Crossbow|0.1;Pulse Rifle|0.04|ar2,overwatch standard issue pulse rifle;Minigun|0.2|sasha;Flamethrower|0.1;Backburner|0.01;
Huntsman|0.02;Eyelander|0.02;Ubersaw|0.02;Kritzkrieg|0.01;Medi Gun|0.03|medigun;Stickybomb Launcher|0.02|sticky bomb launcher;Holiday Punch|0.01;Equalizer|0.01;
AWP|0.3|awm;Desert Eagle|0.3|deagle;M4A1|0.1|m4;Glock|0.08|glock 18;P90|0.05;Negev|0.02;Zeus x27|0.01|zeus taser;Wrench|0.05;Conference Call|0.01;
Unkempt Harold|0.02;Norfleet|0.01;Infinity|0.01|infinity pistol;Hellfire|0.01;Sledge's Shotgun|0.01;Shishkebab|0.02;Lincoln's Repeater|0.01;Laser Rifle|0.03;
That Gun|0.01;Big Boy|0.01;Experimental MIRV|0.01|mirv;Alien Blaster|0.02;Super Sledge|0.02;Junk Jet|0.02;Rock-it Launcher|0.01|rockit launcher;
Mysterious Magnum|0.01;Dawnbreaker|0.03;Mehrunes' Razor|0.02|mehrunes razor;Wabbajack|0.05;Chillrend|0.02;Dragonbane|0.01;Auriel's Bow|0.02|auriels bow;Volendrung|0.01;
Mace of Molag Bal|0.01;Ebony Blade|0.02;Daedric Sword|0.05;Glass Sword|0.02;Nightingale Bow|0.01;Umbra|0.01;Goldbrand|0.01;Black Knight Halberd|0.02;Drake Sword|0.02;
Claymore|0.05;Uchigatana|0.04;Sword of Night and Flame|0.03;Moonveil|0.05;Blasphemous Blade|0.03;Dark Moon Greatsword|0.03;Greatsword of Artorias|0.02;
Farron Greatsword|0.01;Fume Ultra Greatsword|0.01;Smough's Hammer|0.01;Dragonslayer Spear|0.01;Hand of Malenia|0.02;Starscourge Greatsword|0.01;
Godslayer's Greatsword|0.01;Bolt of Gransax|0.01;Ruins Greatsword|0.01;Giant-Crusher|0.01|giant crusher;Hunter Axe|0.02;Threaded Cane|0.02;Kirkhammer|0.02;
Chikage|0.02;Rakuyo|0.01;Burial Blade|0.01;Holy Moonlight Sword|0.02;Whirligig Saw|0.01;Blades of Mercy|0.01;Logarius' Wheel|0.01|logarius wheel;Beast Claw|0.01;
Kusabimaru|0.01;Mortal Blade|0.02;Draupnir Spear|0.03;Blade of Olympus|0.05;Nemean Cestus|0.01;Claws of Hades|0.01;Rebellion|0.05;Yamato|0.1;
Ebony & Ivory|0.05|ebony and ivory;Red Queen|0.02;Alastor|0.01;Devil Sword Dante|0.01;Pandora|0.01;Force Edge|0.01;Scarborough Fair|0.02;Solar Gun|0.01|gun del sol;
Patriot|0.01;HF Blade|0.03|high frequency blade;Mk22|0.01|tranquilizer gun;Stinger|0.01;Samurai Edge|0.03;Lightning Hawk|0.01;Broken Butterfly|0.02;Striker|0.01;
Chicago Typewriter|0.03;Red9|0.03|red 9;Combat Knife|0.03|knife;Steel Pipe|0.02;Hyper Blaster|0.01;Gnasher|0.03;Hammerburst|0.02;Longshot|0.02;Boomshot|0.03;
Torque Bow|0.03;Mulcher|0.01;Retro Lancer|0.02;Dropshot|0.01;OmniWrench|0.05|omni wrench;Groovitron|0.03;RYNO|0.05|r y n o;Mr. Zurkon|0.02|mr zurkon;Sheepinator|0.02;
Morph-o-Ray|0.02|morph o ray;Suck Cannon|0.01;Fusion Grenade|0.01;Buzz Blades|0.01;Warmonger|0.01;Qwack-O-Ray|0.01;Pixelizer|0.01;Topiary Sprinkler|0.01;
Thorn|0.02;Ace of Spades|0.02;Hawkmoon|0.02;Last Word|0.02;Vex Mythoclast|0.01;Sleeper Simulant|0.01;Whisper of the Worm|0.01;Outbreak Perfected|0.01;Ice Breaker|0.01;
Telesto|0.02;Fatebringer|0.01;Divinity|0.01;Wish-Ender|0.01;Peacekeeper|0.02;Rocket Hammer|0.02;Ragnarok|0.03;Apocalypse|0.01;Lionheart|0.03;Brotherhood|0.01;
Fusion Swords|0.01;Engine Blade|0.01;Princess Guard|0.01;Excalipoor|0.01;Way to the Dawn|0.01;Fenrir|0.01;Lady Luck|0.01;Rainbow|0.01;Casey Bat|0.01;
Legendary Bat|0.01;Hammer|0.08;Super Star|0.05|star;Bob-omb|0.03;Green Shell|0.08;Red Shell|0.08;Lightning|0.03;Boomerang Flower|0.01;Super Horn|0.01;
F.L.U.D.D.|0.04|fludd;Cappy|0.03;Home-Run Bat|0.04|home run bat;Beam Sword|0.03;Star Rod|0.03;Fan|0.01;Lip's Stick|0.01|lips stick;Arm Cannon|0.1;
Ice Beam|0.03;Wave Beam|0.02;Plasma Beam|0.02;Splat Roller|0.04|roller;Splat Charger|0.02|charger;Inkbrush|0.01;Tri-Slosher|0.01|slosher;Splatling|0.01;
Splat Dualies|0.01|dualies;Splat Brella|0.01|brella;Tri-Stringer|0.01|stringer;Splatana|0.01;Netherite Sword|0.2;Trident|0.1;Mace|0.05;TNT|0.1;Netherite Axe|0.03;
Wooden Sword|0.05;Iron Sword|0.08;Golden Sword|0.03;Stone Sword|0.03;Zenith|0.08;Terra Blade|0.05;Meowmere|0.03;Night's Edge|0.02|nights edge;Copper Shortsword|0.03;
Star Wrath|0.01;Last Prism|0.02;S.D.M.G.|0.01|sdmg;Megashark|0.02;Minishark|0.01;Influx Waver|0.01;Daedalus Stormbow|0.01;Vampire Knives|0.01;
Stardust Dragon Staff|0.01;Nail|0.04|old nail,pure nail;Real Knife|0.02;Stick|0.01;Toy Knife|0.01;Burnt Pan|0.01;Worn Dagger|0.01;Empty Gun|0.01;Boogie Bomb|0.03;
Pump Shotgun|0.05|pump;SCAR|0.08|scar;Pickaxe|0.1|harvesting tool;Tactical Shotgun|0.02;Grappler|0.01;Shockwave Grenade|0.02;Infinity Blade|0.03;Groza|0.02;
Kar98k|0.03|kar98;Thundergun|0.03;Winter's Howl|0.01;Scavenger|0.01;Baby Maker|0.01;Sliquifier|0.01;Blundergat|0.01;Acid Gat|0.01;Staff of Ice|0.01|ice staff;
Apothicon Servant|0.01;KN-44|0.01;Intervention|0.05;Model 1887|0.02|1887,1887s;ACR|0.01;MP5|0.03;Ballistic Knife|0.02;Ray Gun Mark II|0.01|ray gun mark 2;
Death Machine|0.01;War Machine|0.01;The Penetrator|0.01|penetrator;Dubstep Gun|0.02;Inflato-Ray|0.01;Freezethrower|0.01;Devastator|0.01;Pipe Bomb|0.01;
Chronoscepter|0.01|chrono scepter;Farsight|0.01;Laptop Gun|0.01;Reaper|0.01;Slayer|0.01;Phoenix|0.01;Callisto NTG|0.01;Klobb|0.02;Moonraker Laser|0.01;PP7|0.01;
DD44|0.01;RC-P90|0.01;Cougar Magnum|0.01;Shadowmourne|0.02;Doomhammer|0.02;Gorehowl|0.01;Atiesh|0.01;Val'anyr|0.01|valanyr;Sulfuras|0.02;Warglaives of Azzinoth|0.03|warglaives;
Thori'dal|0.01|thoridal;Windforce|0.02;The Grandfather|0.01|grandfather;Butcher's Cleaver|0.01;Infinity Edge|0.03;Sky-Hook|0.02|skyhook;Silver Sword|0.03;
Aerondight|0.02;Insect Glaive|0.02;Gunlance|0.02;Hunting Horn|0.02;Switch Axe|0.02;Charge Blade|0.02;Shovel Blade|0.02|shovel;Peashooter|0.03;Line Gun|0.01;
Force Gun|0.01;Kunai|0.02;Dual Pistols|0.02;Sword of Altair|0.01;Leviathan|0.05;Chaos Blades|0.03|blades of exile;Elder Wand|0.01;Paintball Gun|0.01;
Grapple Beam|0.01;Gravity Gauntlets|0.01;Gravity Gun|6;Zero Point Energy Field Manipulator|0.01|zpefm;Halberd|0.01;Ultra Greatsword|0.01""")

genres = split_hand("""Action|0.5;Action RPG|0.3|arpg;Tactical RPG|0.08|srpg,strategy rpg;CRPG|0.04|computer rpg;Dungeon Crawler|0.08;Hack and Slash|0.1|hack n slash,hack and slash;
Looter Shooter|0.05;Psychological Horror|0.04;Tactical Shooter|0.08;Arena Shooter|0.05;Platform Fighter|0.04;Precision Platformer|0.02;3D Platformer|0.08;Endless Runner|0.05|runner;
Puzzle Platformer|0.04;Physics Game|0.02;Trivia|0.04|quiz;Board Game|0.04;Card Battler|0.02;Gacha|0.05;Hidden Object|0.02;Escape Room|0.02;Flight Simulator|0.05|flight sim;
Sim Racing|0.03|racing sim;Truck Simulator|0.02;Space Sim|0.02|space simulator;God Game|0.02;Colony Sim|0.02;Tycoon|0.05|management;Business Sim|0.01;
Sports Management|0.01;Fishing|0.03;Hunting|0.01;Pinball|0.03;Dance|0.02;Karaoke|0.01;Fitness|0.02|exergame;Educational|0.03|edutainment;Serious Game|0.01;
Art Game|0.01;Interactive Movie|0.02|fmv,full motion video;Mystery|0.02|detective;Narrative|0.02|story rich,story;Crafting|0.02;Base Building|0.02;Turn-based Tactics|0.04|tactics;
Wargame|0.01;Artillery|0.01|artillery game;Battle Arena|0.02;Vehicular Combat|0.02|car combat;Mecha|0.02|mech game;Social Deduction|0.04;MUD|0.01;Cozy Game|0.04|cozy;
Match-3|0.03|match three,match 3;Tile-matching|0.01;Falling Block Puzzle|0.01;Programming Game|0.01|zachlike;Puzzle Adventure|0.01;Graphic Adventure|0.01;Otome|0.01;
Mascot Platformer|0.01;Cute 'em up|0.01|cute em up;Top-down Shooter|0.02;Creature Collector|0.03;Virtual Pet|0.02|pet sim;Asymmetric Multiplayer|0.01|asymmetric;
Anime Fighter|0.01|airdasher;Arena Fighter|0.01;Photography|0.01|photography game;Cooking|0.02|cooking game;Social Sim|0.01;AR Game|0.01|augmented reality;
Location-based|0.01|location based game;VR|0.03|vr game,virtual reality;Masocore|0.01|rage game;Alternate Reality Game|0.01|arg;Mahjong|0.01;Gallery Shooter|0.01;
Maze|0.01|maze game;Brick Breaker|0.01|breakout clone;Picross|0.01|nonogram;Slice of Life|0.01;Real-time Tactics|0.01|rtt;Wave Shooter|0.01;Action-adventure|0.2;
Survival Horror|0.5;Horde Shooter|0.01;Souls-lite|0.01;Clicker|0.05;Incremental|0.03;Lane Battler|0.01;Trading Card Game|0.05|tcg,ccg;
Sandbox Survival|0.02;Space Combat|0.01;Fighting Platformer|0.01;Retro|0.01;Simulation Racing|0.01;Golf|0.02;Skateboarding|0.02;Bowling|0.01;Chess|0.02;
Shooting Gallery|0.01;Run Based|0.01;Hero Collector|0.01;Hyper-casual|0.02|hypercasual,casual;Puzzle RPG|0.01;Rhythm RPG|0.01;Visual Novel Adventure|0.01;
Sokoban-like|0.01;Escape Game|0.01;Typing|0.01;Open World Survival|0.01;Extraction RPG|0.01;Autoshooter|0.01|auto shooter""")

bosses = split_hand("""Seth|0.03;Gill|0.02;Akuma|0.1|gouki;Shinnok|0.03;Onaga|0.02;Blaze|0.01;Kronika|0.01;Jinpachi|0.01;Azazel|0.01;True Ogre|0.02|ogre;Heihachi|0.03;Perfect Chaos|0.05;
Biolizard|0.02|finalhazard;Solaris|0.02;Time Eater|0.02;Metal Sonic|0.05;Infinite|0.01;Death Egg Robot|0.02;Neo Cortex|0.05|cortex,dr neo cortex;Uka Uka|0.02;Gnasty Gnorc|0.03;
Ripto|0.02;The Sorceress|0.01|sorceress;Gruntilda|0.05|grunty;King K. Rool|0.15|k rool,king k rool;Lord Fredrik|0.01;Zero Two|0.02|0 2;Void Termina|0.02;Queen Sectonia|0.01;
Star Dream|0.01;Fecto Elfilis|0.01;Raven Beak|0.02;Emperor Ing|0.01;Prophet of Truth|0.02|truth;343 Guilty Spark|0.02|guilty spark;Gravemind|0.02;Atriox|0.01;
Escharum|0.01;Cortana|0.03;Harbinger|0.02;The Illusive Man|0.02|illusive man;Wheatley|0.15;Nihilanth|0.08;Wallace Breen|0.03|breen;Icon of Sin|0.1;Cyberdemon|0.08;
Spider Mastermind|0.05;Khan Maykr|0.01;The Dark Lord|0.01;Shub-Niggurath|0.02;Mecha Hitler|0.02;Baal|0.02;Mephisto|0.02;Lilith|0.02;Overmind|0.01;Amon|0.01;
Kerrigan|0.03|sarah kerrigan;Kil'jaeden|0.01|kiljaeden;Illidan|0.05|illidan stormrage;Deathwing|0.04;Sargeras|0.02;Alduin|0.1;Mehrunes Dagon|0.03;Dagoth Ur|0.04;
The Master|0.02;Frank Horrigan|0.02;Frank Fontaine|0.03|fontaine,atlas;Comstock|0.02|zachary comstock;Hive Mind|0.01;The Marker|0.01|marker;Tyrant|0.05;Nemesis|0.08;
Osmund Saddler|0.03|saddler;Mother Miranda|0.03|miranda;Alexia|0.01|alexia ashford;Eveline|0.02;Samael|0.01;Incubus|0.01;Mary|0.01;Chaos|0.02;Necron|0.1;
Yu Yevon|0.02;Vayne|0.01;Orphan|0.01;Ardyn|0.03|ardyn izunia;Ultima|0.01;Caius|0.01|caius ballad;Zodiark|0.01;Endsinger|0.01;Zoma|0.02;Dragonlord|0.03;Hargon|0.01;
Malroth|0.01;Psaro|0.01|necrosaro;Mortamor|0.01;Rhapthorne|0.01;Calasmos|0.01;Time Devourer|0.01;Asriel|0.1|asriel dreemurr;Sans|0.15;The Devil|0.05|devil;
King Dice|0.03;Absolute Radiance|0.03;Grand Mother Silk|0.02;Hades|0.05;Chronos|0.02;The Collector|0.02|collector;Hand of the King|0.01;The Lich|0.01|lich;Mom|0.05;
Mom's Heart|0.02|moms heart;It Lives|0.01;Satan|0.02;The Lamb|0.02|lamb;Hush|0.01;Delirium|0.01;Mother|0.01;The Beast|0.01|beast;Mega Satan|0.01;The Enchantress|0.01|enchantress;
Kuro|0.01;Shriek|0.01;Leshy|0.01;Grimora|0.01;P03|0.01;Nyx|0.01;Izanami|0.01;Yaldabaoth|0.01;Erebus|0.01;Cynthia|0.1;Red|0.05;Blue|0.1|gary,gary oak;Lance|0.03;
Leon|0.03;Steven|0.02|steven stone;Geeta|0.01;Dark Link|0.02;Demon King Ganondorf|0.05;Cackletta|0.01;Fawful|0.02;Count Bleck|0.02;Dimentio|0.02;Shadow Queen|0.02;
Antasma|0.01;Bowletta|0.01;Smithy|0.01;Captain Syrup|0.01;Baby Bowser|0.02;King Boo|0.1;Medeus|0.01;Fire Dragon|0.01;Grima|0.01;Anankos|0.01;Ashnard|0.01;Ashera|0.01;
Sombron|0.01;Zanza|0.01;Malos|0.01;Z|0.01;Master Hand|0.2;Crazy Hand|0.05;Tabuu|0.08;Galeem|0.05;Dharkon|0.02;Emperor Bulblax|0.01;Smoky Progg|0.01;Plasm Wraith|0.01;
Titan Dweevil|0.01;DJ Octavio|0.02;Commander Tartar|0.01;Mr. Grizz|0.01;Sigma|0.05;Dr. Weil|0.01;Malus|0.01;The Queen|0.01;Nashandra|0.01;Aldia|0.01;Old One|0.01|false king allant;
Nameless Puppet|0.01;Odin|0.03;Baldur|0.04;Mundus|0.02;Arkham|0.01;Vergil|0.08;Urizen|0.02;Jubileus|0.01;Aesir|0.01;Singularity|0.01;Metal Gear Rex|0.02|rex;
Solidus|0.03|solidus snake;Senator Armstrong|0.1|armstrong;Liquid Ocelot|0.02;Sahelanthropus|0.01;Joker|0.1|the joker;Doctor Octopus|0.03|doc ock;Venom|0.03;
Al Mualim|0.02;Rodrigo Borgia|0.02|borgia;Cesare Borgia|0.01;Juno|0.01;Pagan Min|0.02;Joseph Seed|0.02;Anton Castillo|0.01;Micah Bell|0.02|micah;Mr. Dark|0.01;
Coach Oleander|0.01|oleander;The Destroyer|0.01|destroyer;The Warrior|0.01|warrior;Calypso Twins|0.01|troy and tyreen,troy,tyreen;Oryx|0.03;Crota|0.02;The Witness|0.02|witness;
Savathun|0.01;Ghaul|0.01;Queen Myrrah|0.02|myrrah;General RAAM|0.02|raam;Nightmare|0.03;Inferno|0.01;Mike Tyson|0.05|mr dream;Heinrich|0.01;Alec Trevelyan|0.02|trevelyan;
Red Falcon|0.01;Mr. Dark|0.01;Sephiroth|6;Lavos|0.3;Malenia|0.05;Rennala|0.01;Godrick|0.01;Morgott|0.01;Maliketh|0.02;Consort Radahn|0.03|radahn;Ornstein and Smough|0.03|ornstein,smough;
Manus|0.01;Nameless King|0.15;The Moon Presence|0.15;Gehrman|0.05|gehrman the first hunter;Orphan of Kos|0.03;Ludwig|0.02;Gascoigne|0.02|father gascoigne;
Herobrine|0.02;Wither|0.3;Elder Guardian|0.02;Warden|0.05;The Lich King|1;Ultron|0.01;Thanos|0.01;Darkseid|0.01;Brainiac|0.01;Hans Volter? |0.0""")
bosses = [b for b in bosses if "?" not in b]

world_extra = {"fruit": fruit, "animals": animals, "countries": countries, "pizza": pizza, "sports": sports}

EXTRA = {
    "gaming": [consoles, poke, battle_royale, weapons, nintendo, genres, mc, bosses],
    "world": [fruit, animals, countries, pizza, sports],
}

lines = ["const EXTRA = {"]
for pack, rounds in EXTRA.items():
    lines.append(f"  {pack}: [")
    for r in rounds:
        body = ";".join(e for e in r if "`" not in e)
        lines.append("    `" + body + "`,")
    lines.append("  ],")
lines.append("};")
OUT.write_text("\n".join(lines), encoding="utf-8")
for pack, rounds in EXTRA.items():
    print(pack, [len(r) for r in rounds])
