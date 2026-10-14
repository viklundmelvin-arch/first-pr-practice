# First PR Practice

A tiny scratch repo for practicing the GitHub pull request workflow with Claude Code.

## What this is

This repo exists so we can safely practice:
- Making a small change
- Opening a pull request
- Reviewing and merging it

## Add function

The `add` function in `math_utils.py` adds two numbers together.

## EV-skanner (odds → Telegram)

`ev_scanner.py` hämtar odds från [The Odds API](https://the-odds-api.com), räknar fram "fair" sannolikhet
genom att ta bort marginalen (vigen) hos varje bookmaker och ta snittet, och skickar en Telegram-notis när
någon bookmaker ger bättre odds än fair-oddset med minst `MIN_EV` (standard 3 %).

EV = fair-sannolikhet × bästa odds − 1

GitHub Actions (`.github/workflows/ev-scanner.yml`) kör skannern var 3:e timme. Samma bet skickas bara en gång.

### Setup

1. **Odds API-nyckel**: skapa ett gratiskonto på the-odds-api.com och kopiera nyckeln.
2. **Telegram-bot**: skriv till `@BotFather` i Telegram, kör `/newbot` och kopiera token.
   Skicka sedan valfritt meddelande till din nya bot och öppna
   `https://api.telegram.org/bot<TOKEN>/getUpdates` — värdet `chat.id` är ditt chat-ID.
3. **GitHub secrets**: i repot, gå till *Settings → Secrets and variables → Actions* och lägg till
   `ODDS_API_KEY`, `TELEGRAM_BOT_TOKEN` och `TELEGRAM_CHAT_ID`.
4. **Valfritt (Variables-fliken)**: `SPORTS` (kommaseparerade sport-nycklar, standard
   `soccer_epl,soccer_sweden_allsvenskan`) och `MIN_EV` (t.ex. `0.05` för 5 %).
5. Merga till `master` (schemalagda workflows körs bara från default-branchen) och testa med
   *Actions → EV scanner → Run workflow*.

Gratisnivån ger 500 anrop/månad; varje sport kostar 1 anrop per körning. Fler sporter → glesare schema.

Köra lokalt (utan Telegram-variablerna skrivs notiserna ut i terminalen):

```bash
ODDS_API_KEY=din-nyckel python ev_scanner.py
```

Obs: ett positivt EV är ett statistiskt övertag över många spel, ingen garanti för enskilda matcher.
Bookmakers kan begränsa konton som konsekvent spelar på värde.

## Deep Cut (browser game)

`deep-cut/index.html` is a single-file game: answer simple questions with the rarest valid answer you can think of. Rarer answers drop better loot (Common → Mythic). Open the file in a browser to play; no build step.
