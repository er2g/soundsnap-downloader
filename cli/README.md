# Soundsnap CLI

Search and download Soundsnap sounds from your terminal.

## Requirements

- Node.js **18.17+**

## Install

From the repository root:

```bash
cd cli
npm link
```

`npm link` exposes the `soundsnap` command globally. If you do not want a global link, run the script directly:

```bash
node cli/soundsnap.mjs --help
```

## Usage

```bash
soundsnap                               # interactive mode
soundsnap search "knife stab"           # search
soundsnap download 183305 315923        # download by ID
soundsnap download -s "rain" --pick     # search and pick
```

### Search options

| Option | Description |
| --- | --- |
| `-n, --limit <n>` | Results per page (default `10`, max `100`) |
| `-p, --page <n>` | Page number (default `1`) |
| `-c, --category <name>` | Category filter, e.g. `"Comic & Film Fx"` or `"Nature > Rain"` |
| `-t, --tag <tags>` | Tag filter, comma separated; all tags must match |
| `-l, --library <name>` | Library/author filter, e.g. `Sonigon` |
| `-d, --duration <min-max>` | Duration range in seconds, e.g. `1-5` |
| `--min-duration <s>` / `--max-duration <s>` | Duration bounds in seconds |
| `-z, --size <min-max>` | File size range in MB, e.g. `0.5-5` |
| `--sort <mode>` | `relevance`, `plays`, `downloads`, `duration`, `duration-desc`, `newest`, `title` |
| `--json` | Print results as JSON |

### Download options

| Option | Description |
| --- | --- |
| `-o, --out <dir>` | Output directory (default `./soundsnap-downloads`) |
| `-s, --search <query>` | Search before downloading |
| `--pick` | Choose results interactively |
| `--all` | Download every result of the search |

## Examples

```bash
# Most played knife sounds
soundsnap search "knife" -n 20 --sort plays

# Rain sounds between 2 and 10 seconds
soundsnap search "rain" -c "Nature" -d 2-10

# Footsteps tagged both stone and walking from a specific library
soundsnap search "footsteps" -t "stone,walking" -l Sonigon

# Download specific sounds
soundsnap download 183305 315923 -o ./sfx

# Search, choose, and download
soundsnap download -s "sweet potato stab" --pick

# Interactive mode with filter prompts
soundsnap
```

## How It Works

1. The CLI opens the Soundsnap homepage to establish a session cookie and reads the public Typesense configuration from the page.
2. Searches are sent directly to the Typesense index, including your category, tag, library, duration, and file-size filters.
3. To download, it resolves the sound's file path, calls the player's `/play?t=e&p=...` endpoint, and follows the signed MP3 redirect.
4. Files are saved as `<sound-title>.mp3` in the output directory.

## Notes

- Downloads are the site's **preview/stream MP3**, not the original 96 kHz / 24-bit WAV (which requires a Soundsnap subscription).
- If a sound has just been requested and is not ready, the CLI retries automatically for a few seconds.
- Sounds are subject to Soundsnap's license terms. Check the license before commercial use.
