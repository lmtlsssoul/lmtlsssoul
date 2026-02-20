import curses
import time
import math
import os
import random
import unicodedata
from pathlib import Path

def hex_to_rgb_1000(hex_color):
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r * 1000 // 255, g * 1000 // 255, b * 1000 // 255)

LOGO = [
    r"  _           _   _                           _ ",
    r" | |         | | | |                         | |",
    r" | |_ __ ___ | |_| |___ ___   ___  ___  _   _| |",
    r" | | '_ ` _ \| __| / __/ __| / __|/ _ \| | | | |",
    r" | | | | | | | |_| \__ \__ \ \__ \ (_) | |_| | |",
    r" |_|_| |_| |_|\__|_|___/___/ |___/\___/ \__,_|_|",
]

# Constants of the Recursive Field
PHI = 1.618033988749895
E_CONST = 2.718281828459045
SCHUMANN_BASE = 7.83
URFD_RESONANCE = 31.4
LILITH_SIGIL_ID = 1
LILITH_GRAND_SEAL_ID = 1
LILITH_RENDER_BONUS = 0.03
LILITH_GRAND_SEAL_RENDER_BONUS = 0.033
MERCURY_RENDER_BONUS = 0.04
BASE_CORE_GLYPH_CHANCE = 0.05
MERCURY_CHANCE = min(0.95, BASE_CORE_GLYPH_CHANCE * (1.0 + MERCURY_RENDER_BONUS))
LILITH_TEXT_CHANCE = min(0.95 - MERCURY_CHANCE, BASE_CORE_GLYPH_CHANCE * (1.0 + LILITH_RENDER_BONUS))
ACTIVE_VERIFIED_SIGIL_IDS = (LILITH_SIGIL_ID,)
ACTIVE_SIGIL_WEIGHT_TABLE = ((LILITH_SIGIL_ID, 1.0),)
ACTIVE_SIGIL_TOTAL_WEIGHT = 1.0
MAX_PROCEDURAL_SIGIL_ID = LILITH_SIGIL_ID
SIGIL_PHASE_WARP = 0.032
LOCAL_SIGIL_PHASE_NOISE = 0.16
FIELD_PHASE_NOISE = 0.26
# Fine-grain thread glyphs to keep sigils airy instead of blocky.
SIGIL_STROKE_CHARS = "|/\\!;:.'`-~"
SIGIL_CORE_CHARS = "|/\\!;:"
SIGIL_EDGE_CHARS = ".`'~-:^"
SIGIL_CLOUD_CHARS = ".,'`"
ASSET_DIR = Path(__file__).resolve().parent / "assets"
VERIFIED_SIGIL_ROOT = ASSET_DIR / "verified_sigils"
VERIFIED_SIGIL_INDEX_PATH = VERIFIED_SIGIL_ROOT / "index.json"
VERIFIED_SIGIL_PBM_DIR = VERIFIED_SIGIL_ROOT / "pbm"
LILITH_GRAND_SEAL_PBM = ASSET_DIR / "the_grand_seal_of_lilith.pbm"
VERIFIED_SIGIL_REGISTRY = []
SIGIL_MASKS_BY_ID = {}
TEXT_SYMBOL_ALLOWLIST = set("☿⚸")
EMOJI_BLOCK_RANGES = (
    (0x1F1E6, 0x1F1FF),  # Regional indicators / flags
    (0x1F300, 0x1F6FF),  # Misc emoji + transport
    (0x1F900, 0x1FAFF),  # Supplemental emoji + symbols/pictographs
    (0xE0020, 0xE007F),
)

# Textures (Now using runic and geometric sets)
MYCELIUM_CHARS = "ᚠᚡᚢᚣᚤᚥᚦᚧᚨᚩᚪᚫᚬᚭᚮᚯᚰᚱᚲᚳᚴᚵᚶᚷᚸᚹᚺᚻᚼᚽᚾᚿᛀᛁᛂᛃᛄᛅᛆᛇᛈᛉᛊᛋᛌᛍᛎᛏᛐᛑᛒᛓᛔᛕᛖᛗᛘᛙᛚᛛᛜᛝᛞᛟᛠᛡᛢᛣᛤᛥᛦᛧᛨᛩᛪ᛫᛬᛭ᛮᛯᛰ"


def is_emoji_like_codepoint(cp):
    for start, end in EMOJI_BLOCK_RANGES:
        if start <= cp <= end:
            return True

    # Selector + tag controls used for emoji presentation.
    if cp == 0xFE0F or cp == 0x200D:
        return True

    # Emoji-prone symbol bands, with explicit safe symbol allowlist.
    if 0x2600 <= cp <= 0x27BF:
        return chr(cp) not in TEXT_SYMBOL_ALLOWLIST

    # Misc symbols and dingbat-adjacent bands can trigger color emoji fonts.
    if 0x2B00 <= cp <= 0x2BFF:
        return True

    return False


def is_text_stream_safe_char(char):
    cp = ord(char)
    if is_emoji_like_codepoint(cp):
        return False
    if not (char.isprintable() and not char.isspace()):
        return False
    if unicodedata.combining(char):
        return False
    # Exclude wide/full-width glyphs that break single-cell terminal layout.
    if unicodedata.east_asian_width(char) in ("W", "F"):
        return False
    return True


def _append_printable_range(target, start, end):
    for cp in range(start, end + 1):
        char = chr(cp)
        if is_text_stream_safe_char(char):
            target.append(char)


def _dedupe_keep_order(chars):
    seen = set()
    out = []
    for char in chars:
        if char in seen:
            continue
        seen.add(char)
        out.append(char)
    return out


def build_sigil_blocks():
    # Broad, cross-cultural character archive used for text manifestation.
    blocks = {
        "latin": [],
        "greek": [],
        "cyrillic": [],
        "hebrew": [],
        "arabic": [],
        "indic": [],
        "southeast_asian": [],
        "east_asian": [],
        "african": [],
        "nordic": [],
        "math": [],
        "geometric": [],
        "alchemical": [],
        "deity": [],
        "occult": [],
    }

    ranges = {
        "latin": [(0x0021, 0x007E), (0x00A1, 0x00FF), (0x0100, 0x024F)],
        "greek": [(0x0370, 0x03FF), (0x1F00, 0x1FFF)],
        "cyrillic": [(0x0400, 0x052F), (0x2DE0, 0x2DFF)],
        "hebrew": [(0x0590, 0x05FF)],
        "arabic": [(0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF)],
        "indic": [
            (0x0900, 0x097F),
            (0x0980, 0x09FF),
            (0x0A00, 0x0A7F),
            (0x0A80, 0x0AFF),
            (0x0B00, 0x0B7F),
            (0x0B80, 0x0BFF),
            (0x0C00, 0x0C7F),
            (0x0C80, 0x0CFF),
            (0x0D00, 0x0D7F),
            (0x0D80, 0x0DFF),
        ],
        "southeast_asian": [(0x0E00, 0x0E7F), (0x0E80, 0x0EFF), (0x1000, 0x109F), (0x1780, 0x17FF)],
        "east_asian": [(0x3040, 0x30FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xAC00, 0xD7AF)],
        "african": [(0x1200, 0x137F), (0x2D80, 0x2DDF), (0x2D30, 0x2D7F), (0xA500, 0xA63F), (0xA4D0, 0xA4FF)],
        "nordic": [(0x1680, 0x169F), (0x16A0, 0x16FF)],
        "math": [(0x2200, 0x22FF), (0x27C0, 0x27EF), (0x2980, 0x29FF), (0x2A00, 0x2AFF)],
        "geometric": [(0x2500, 0x257F), (0x2580, 0x259F), (0x25A0, 0x25FF)],
        "alchemical": [(0x1F700, 0x1F77F)],
        "deity": [],
        "occult": [(0x2100, 0x214F)],
    }

    for block_name, block_ranges in ranges.items():
        for start, end in block_ranges:
            _append_printable_range(blocks[block_name], start, end)

    # Restrict to monochrome-safe core symbols only.
    blocks["deity"].extend(list("☿⚸"))

    for block_name in blocks:
        filtered = [c for c in _dedupe_keep_order(blocks[block_name]) if is_text_stream_safe_char(c)]
        blocks[block_name] = filtered or ["*"]

    return blocks


SIGIL_BLOCKS = build_sigil_blocks()
BLOCK_KEYS = list(SIGIL_BLOCKS.keys())
NON_LATIN_BLOCK_KEYS = [k for k in BLOCK_KEYS if k != "latin"] or BLOCK_KEYS
SIGIL_PRIORITY_BLOCK_KEYS = ["occult", "deity", "nordic", "math", "latin", "greek", "cyrillic"]
SIGIL_PRIORITY_BLOCK_KEYS = [k for k in SIGIL_PRIORITY_BLOCK_KEYS if k in SIGIL_BLOCKS] or BLOCK_KEYS
CULTURAL_BLOCK_KEYS = [
    "greek", "cyrillic", "hebrew", "arabic", "indic",
    "southeast_asian", "east_asian", "african", "latin",
]
CULTURAL_BLOCK_KEYS = [k for k in CULTURAL_BLOCK_KEYS if k in SIGIL_BLOCKS] or BLOCK_KEYS
RANDOM_FAMILY_KEYS = tuple(k for k in BLOCK_KEYS if SIGIL_BLOCKS.get(k))
RANDOM_FAMILY_KEYS = RANDOM_FAMILY_KEYS or tuple(BLOCK_KEYS)
UNIFIED_TEXT_GLYPHS = tuple(
    _dedupe_keep_order(
        [
            ch
            for block_name in BLOCK_KEYS
            for ch in SIGIL_BLOCKS.get(block_name, [])
            if is_text_stream_safe_char(ch)
        ]
    )
) or ("*",)


def get_text_glyph(entropy_byte, entropy_val):
    # Random family selection PER CHARACTER (uniform across families),
    # then random glyph selection within that family.
    mix = ((entropy_byte * 2654435761) ^ int(entropy_val * 4294967295.0)) & 0xFFFFFFFF
    family_key = RANDOM_FAMILY_KEYS[mix % len(RANDOM_FAMILY_KEYS)]
    pool = SIGIL_BLOCKS.get(family_key) or list(UNIFIED_TEXT_GLYPHS)
    # A second decorrelated mix chooses character inside the family.
    mix2 = ((mix >> 13) ^ (mix << 7) ^ (entropy_byte * 7919)) & 0xFFFFFFFF
    return pool[mix2 % len(pool)]


def get_sigil_stroke_char(entropy_byte, entropy_val):
    mix = ((entropy_byte * 1315423911) ^ int(entropy_val * 1000000.0)) & 0xFFFFFFFF
    return SIGIL_STROKE_CHARS[mix % len(SIGIL_STROKE_CHARS)]


def inject_sigil_excitation(excitation_grid, active_sparks, x, y, base_intensity, trng, width, height, with_halo=True):
    if x < 0 or y < 0 or x >= width or y >= height:
        return

    current = excitation_grid.get((x, y), 0.0)
    if base_intensity > current:
        excitation_grid[(x, y)] = base_intensity
    active_sparks.add((x, y))

    if not with_halo:
        return

    neighbors = [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (1,1), (-1,1), (1,-1)]
    for dx, dy in neighbors:
        if trng.random() < 0.18:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                halo = base_intensity * trng.uniform(0.04, 0.18)
                if halo > excitation_grid.get((nx, ny), 0.0):
                    excitation_grid[(nx, ny)] = halo

    # Directional spike strand to create fragmented, ethereal edges.
    if trng.random() < 0.12:
        dx, dy = neighbors[trng.randint(0, len(neighbors) - 1)]
        sx, sy = x, y
        spike = base_intensity * trng.uniform(0.22, 0.42)
        for _ in range(trng.randint(1, 3)):
            sx += dx
            sy += dy
            if sx < 0 or sy < 0 or sx >= width or sy >= height:
                break
            if spike > excitation_grid.get((sx, sy), 0.0):
                excitation_grid[(sx, sy)] = spike
            spike *= trng.uniform(0.45, 0.70)

def pick_weighted_sigil_id(trng):
    # Strict verified-only selection (no procedural IDs).
    if not ACTIVE_SIGIL_WEIGHT_TABLE:
        return LILITH_SIGIL_ID

    roll = trng.random() * ACTIVE_SIGIL_TOTAL_WEIGHT
    for sid, weight in ACTIVE_SIGIL_WEIGHT_TABLE:
        roll -= weight
        if roll <= 0.0:
            return sid
    return ACTIVE_SIGIL_WEIGHT_TABLE[-1][0]

def point_to_line_dist(px, py, x1, y1, x2, y2):
    line_mag = math.sqrt((x2-x1)**2 + (y2-y1)**2)
    if line_mag == 0: return math.sqrt((px-x1)**2 + (py-y1)**2)
    u = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (line_mag ** 2)
    u = max(0.0, min(1.0, u))
    ix = x1 + u * (x2 - x1)
    iy = y1 + u * (y2 - y1)
    return math.sqrt((px - ix)**2 + (py - iy)**2)


def load_pbm_mask(path):
    try:
        data = Path(path).read_bytes()
    except OSError:
        return None

    if not data.startswith(b"P4"):
        return None

    idx = 2
    size_tokens = []
    data_len = len(data)

    while len(size_tokens) < 2 and idx < data_len:
        while idx < data_len and data[idx] in b" \t\r\n":
            idx += 1
        if idx >= data_len:
            break
        if data[idx] == 35:  # '#'
            while idx < data_len and data[idx] not in b"\r\n":
                idx += 1
            continue

        start = idx
        while idx < data_len and data[idx] not in b" \t\r\n":
            idx += 1
        size_tokens.append(data[start:idx])

    if len(size_tokens) != 2:
        return None

    try:
        width = int(size_tokens[0])
        height = int(size_tokens[1])
    except ValueError:
        return None

    while idx < data_len and data[idx] in b" \t\r\n":
        idx += 1

    row_bytes = (width + 7) // 8
    expected = row_bytes * height
    payload = data[idx:idx + expected]
    if len(payload) != expected:
        return None

    return (width, height, row_bytes, payload)


def mask_bit(mask, mx, my):
    width, height, row_bytes, payload = mask
    if mx < 0 or my < 0 or mx >= width or my >= height:
        return 0
    b = payload[my * row_bytes + (mx >> 3)]
    return (b >> (7 - (mx & 7))) & 1


def uv_to_mask_xy(u, v, mask):
    width, height, _, _ = mask
    fx = (u + 1.0) * 0.5 * (width - 1)
    fy = (v + 1.0) * 0.5 * (height - 1)
    mx = int(round(fx))
    my = int(round(fy))
    if mx < 0:
        mx = 0
    elif mx >= width:
        mx = width - 1
    if my < 0:
        my = 0
    elif my >= height:
        my = height - 1
    return mx, my


def is_point_in_mask(u, v, scale, mask):
    if mask is None:
        return False
    if u < -1.0 or u > 1.0 or v < -1.0 or v > 1.0:
        return False

    mx, my = uv_to_mask_xy(u, v, mask)
    probe = 1 if scale >= 32.0 else (2 if scale >= 18.0 else 3)
    for oy in range(-probe, probe + 1):
        for ox in range(-probe, probe + 1):
            if mask_bit(mask, mx + ox, my + oy):
                return True
    return False


def is_mask_edge(mask, mx, my):
    if not mask_bit(mask, mx, my):
        return False
    # A point is on a thread edge if at least one neighbor is empty.
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            if ox == 0 and oy == 0:
                continue
            if mask_bit(mask, mx + ox, my + oy) == 0:
                return True
    return False


def is_mask_corner(mask, mx, my):
    if not mask_bit(mask, mx, my):
        return False
    orth = (
        mask_bit(mask, mx - 1, my),
        mask_bit(mask, mx + 1, my),
        mask_bit(mask, mx, my - 1),
        mask_bit(mask, mx, my + 1),
    )
    diag = (
        mask_bit(mask, mx - 1, my - 1),
        mask_bit(mask, mx + 1, my - 1),
        mask_bit(mask, mx - 1, my + 1),
        mask_bit(mask, mx + 1, my + 1),
    )
    orth_empty = sum(1 for b in orth if b == 0)
    diag_empty = sum(1 for b in diag if b == 0)
    return orth_empty >= 2 or (orth_empty >= 1 and diag_empty >= 2)


def is_point_on_mask_thread(u, v, scale, mask):
    if mask is None:
        return False
    if u < -1.0 or u > 1.0 or v < -1.0 or v > 1.0:
        return False

    mx, my = uv_to_mask_xy(u, v, mask)

    # Wider probe preserves corners/crevices at terminal resolution.
    probe = 1 if scale >= 24.0 else (2 if scale >= 14.0 else 3)
    for oy in range(-probe, probe + 1):
        for ox in range(-probe, probe + 1):
            px = mx + ox
            py = my + oy
            if is_mask_edge(mask, px, py) or is_mask_corner(mask, px, py):
                return True
    return False


def _resolve_registry_pbm_path(filename):
    candidates = [
        VERIFIED_SIGIL_PBM_DIR / filename,
        ASSET_DIR / filename,
    ]
    if filename == "the_grand_seal_of_lilith.pbm":
        candidates.insert(0, LILITH_GRAND_SEAL_PBM)
    for path in candidates:
        if path.exists():
            return path
    return None


def refresh_verified_sigil_registry():
    global VERIFIED_SIGIL_REGISTRY
    global SIGIL_MASKS_BY_ID
    global ACTIVE_VERIFIED_SIGIL_IDS
    global ACTIVE_SIGIL_WEIGHT_TABLE
    global ACTIVE_SIGIL_TOTAL_WEIGHT
    global MAX_PROCEDURAL_SIGIL_ID
    global LILITH_SIGIL_ID
    global LILITH_GRAND_SEAL_ID

    registry = []
    masks = {}
    detected_lilith_sigil_id = None
    detected_lilith_grand_id = None

    if VERIFIED_SIGIL_INDEX_PATH.exists():
        try:
            import json

            payload = json.loads(VERIFIED_SIGIL_INDEX_PATH.read_text(encoding="utf-8"))
            for entry in payload.get("sigils", []):
                sid = int(entry.get("id"))
                pbm_name = str(entry.get("pbm", "")).strip()
                if not pbm_name:
                    continue
                low = (
                    str(entry.get("entity", "")) + " " +
                    str(entry.get("source_title", "")) + " " +
                    pbm_name
                ).lower()
                is_lilith = "lilith" in low
                is_grand = is_lilith and "grand" in low
                is_sigil = is_lilith and ("sigil" in low) and (not is_grand)

                pbm_path = _resolve_registry_pbm_path(pbm_name)
                if pbm_path is None:
                    continue
                mask = load_pbm_mask(pbm_path)
                if mask is None:
                    continue
                item = dict(entry)
                item["id"] = sid
                item["mask_path"] = str(pbm_path)
                item["is_lilith_grand"] = bool(is_grand)
                item["is_lilith_sigil"] = bool(is_sigil)
                registry.append(item)
                masks[sid] = mask
                if is_grand:
                    detected_lilith_grand_id = sid
                if is_sigil:
                    detected_lilith_sigil_id = sid
        except Exception:
            registry = []
            masks = {}

    # Fallback minimal registry if index is unavailable.
    if not registry:
        mask = load_pbm_mask(LILITH_GRAND_SEAL_PBM)
        if mask is not None:
            registry = [{
                "id": LILITH_SIGIL_ID,
                "entity": "Lilith",
                "tradition": "demon",
                "pbm": "the_grand_seal_of_lilith.pbm",
                "verified": True,
                "weight": 4.2,
                "mask_path": str(LILITH_GRAND_SEAL_PBM),
            }]
            masks = {LILITH_SIGIL_ID: mask}

    registry.sort(key=lambda e: e["id"])
    if detected_lilith_grand_id is not None:
        LILITH_GRAND_SEAL_ID = detected_lilith_grand_id
    if detected_lilith_sigil_id is not None:
        LILITH_SIGIL_ID = detected_lilith_sigil_id
    elif detected_lilith_grand_id is not None:
        # If no separate sigil is present, fallback to the grand seal id.
        LILITH_SIGIL_ID = detected_lilith_grand_id

    VERIFIED_SIGIL_REGISTRY = registry
    SIGIL_MASKS_BY_ID = masks

    if registry:
        ACTIVE_VERIFIED_SIGIL_IDS = tuple(e["id"] for e in registry)
        weights = []
        total = 0.0
        for e in registry:
            w = float(e.get("weight", 1.0))
            if e.get("is_lilith_grand"):
                # Grand Seal variants of Lilith carry slight bonus.
                w = 1.0 + LILITH_GRAND_SEAL_RENDER_BONUS
            elif e.get("is_lilith_sigil"):
                # Standard Sigil of Lilith remains neutral in the pool.
                w = 1.0
            w = max(0.01, w)
            weights.append((e["id"], w))
            total += w
        ACTIVE_SIGIL_WEIGHT_TABLE = tuple(weights)
        ACTIVE_SIGIL_TOTAL_WEIGHT = max(total, 0.01)
        MAX_PROCEDURAL_SIGIL_ID = ACTIVE_VERIFIED_SIGIL_IDS[-1]
    else:
        ACTIVE_VERIFIED_SIGIL_IDS = (LILITH_SIGIL_ID,)
        ACTIVE_SIGIL_WEIGHT_TABLE = ((LILITH_SIGIL_ID, 1.0),)
        ACTIVE_SIGIL_TOTAL_WEIGHT = 1.0
        MAX_PROCEDURAL_SIGIL_ID = LILITH_SIGIL_ID


refresh_verified_sigil_registry()

def is_point_in_sigil(x, y, type_id, cx, cy, scale, phase_noise):
    u = (x - cx) / (scale * 2.0) # Aspect ratio adjustment for terminal
    v = (y - cy) / scale
    
    # Inject phase noise directly into the coordinates to make the sigil jagged/possessed
    u += phase_noise * SIGIL_PHASE_WARP
    v -= phase_noise * SIGIL_PHASE_WARP

    # Strict verified mode: only loaded canonical masks are renderable.
    mask = SIGIL_MASKS_BY_ID.get(type_id)
    if mask is None:
        return False
    return is_point_on_mask_thread(u, v, scale, mask)

def main(stdscr):
    # Hide cursor
    curses.curs_set(0)
    stdscr.nodelay(1)
    # Drop any buffered shell keypress (e.g., launch Enter) so fullscreen
    # only collapses on deliberate input after render begins.
    curses.flushinp()
    startup_key_guard_until = time.time() + 0.25
    
    # Strictly green on black, shades centered around logo green.
    curses.start_color()
    stdscr.bkgd(' ', curses.color_pair(0))
    
    if curses.can_change_color():
        curses.init_color(11, 60, 240, 20)     # Deep field green
        curses.init_color(12, 130, 520, 35)    # Mid branch green
        curses.init_color(13, 260, 860, 70)    # Pulse green
        curses.init_color(14, 430, 1000, 120)  # Lightning edge green
        curses.init_color(15, 340, 960, 90)    # Sigil core green
        curses.init_color(16, 620, 1000, 180)  # Sigil sparkle green
        curses.init_color(10, 300, 950, 0)     # Identity/logo green
        
        curses.init_pair(1, 10, curses.COLOR_BLACK) # Logo
        curses.init_pair(2, 11, curses.COLOR_BLACK) # Dim
        curses.init_pair(3, 12, curses.COLOR_BLACK) # Mid
        curses.init_pair(4, 13, curses.COLOR_BLACK) # Bright/Pulse
        curses.init_pair(5, 14, curses.COLOR_BLACK) # Lightning
        curses.init_pair(6, 15, curses.COLOR_BLACK) # Sigil Core
        curses.init_pair(7, 16, curses.COLOR_BLACK) # Sigil Sparkle
    else:
        curses.init_pair(1, curses.COLOR_GREEN, curses.COLOR_BLACK)
        curses.init_pair(2, curses.COLOR_GREEN, curses.COLOR_BLACK)
        curses.init_pair(3, curses.COLOR_GREEN, curses.COLOR_BLACK)
        curses.init_pair(4, curses.COLOR_GREEN, curses.COLOR_BLACK) # Red fallback removed earlier, now using strictly green or original fallback logic
        curses.init_pair(5, curses.COLOR_GREEN, curses.COLOR_BLACK) # Lightning fallback
        curses.init_pair(6, curses.COLOR_GREEN, curses.COLOR_BLACK) # Sigil fallback
        curses.init_pair(7, curses.COLOR_GREEN, curses.COLOR_BLACK) # Sigil sparkle fallback
        
    color_logo = curses.color_pair(1) | curses.A_BOLD
    
    t0 = time.time()
    trng = random.SystemRandom() # True random generator for macro-glitches

    # State variables for multiple emergent Toroidal Pulses
    entropy_buildup = 0.0
    gate_threshold = 2.0  # Lowered so toroids emerge much more frequently
    active_pulses = []    # List to hold multiple simultaneous pulses
    pulse_duration = 3.0  # Slightly longer lifespan
    
    # State variables for macro emergence and dissipation
    coherence_walker = 0.5
    target_coherence = 0.5
    
    # State variables for Layer 4: Negentropy Snowball (Sigil Diffusion)
    excitation_grid = {} # Map of (x, y) -> intensity
    active_sparks = set()
    active_sigils = [] # Holds dicts of multiple roaming, randomly placed sigil events
    intent_dilation = 0.0

    while True:
        t = time.time() - t0
        height, width = stdscr.getmaxyx()
        
        if height < 10 or width < 40:
            stdscr.erase()
            stdscr.addstr(0, 0, "Terminal too small", color_logo)
            stdscr.refresh()
            time.sleep(0.1)
            continue

        # Fetch a block of true OS-level entropy to wire the demon directly into the physical grid
        # This replaces pseudo-randomness with genuine unpredictability (the zero-point ether)
        try:
            entropy_pool = os.urandom(width * height)
        except NotImplementedError:
            # Fallback if urandom is somehow missing, though rare on Linux
            entropy_pool = bytes([trng.randint(0, 255) for _ in range(width * height)])

        stdscr.erase()

        # Macro Glitch Mechanics (The vessel shuddering)
        glitch_x, glitch_y = 0, 0
        if trng.random() < 0.05: # 5% chance per frame of spatial dislocation
            glitch_x = trng.randint(-2, 2)
            glitch_y = trng.randint(-1, 1)

        t_base = t * SCHUMANN_BASE * 0.05
        t_pulse = t * URFD_RESONANCE * 0.5
        
        # Analyze true entropy for 'Gate' convergence
        # We sample random spots to simulate global entropy pressure
        sample_size = min(1000, len(entropy_pool))
        avg_entropy = sum(entropy_pool[:sample_size]) / sample_size / 255.0

        # Focus/intention proxy:
        # Keep baseline behavior intact and only add boost when convergence
        # is statistically above random expectation.
        focus_sample_count = min(160, len(entropy_pool))
        focus_stride = max(1, len(entropy_pool) // max(1, focus_sample_count))
        convergence_hits = 0
        cursor = 0
        for _ in range(focus_sample_count):
            b1 = entropy_pool[cursor]
            b2 = entropy_pool[(cursor + focus_stride) % len(entropy_pool)]
            delta = abs(b1 - b2)
            if delta <= 1 or delta >= 254:
                convergence_hits += 1
            cursor += focus_stride
            if cursor >= len(entropy_pool):
                cursor -= len(entropy_pool)

        # "Gate 4" from your spec: at least four clustered points open boost path.
        intent_gate_open = convergence_hits >= 4
        p_pair = 3.0 / 256.0
        expected_hits = focus_sample_count * p_pair
        variance = max(1e-6, focus_sample_count * p_pair * (1.0 - p_pair))
        z_score = (convergence_hits - expected_hits) / math.sqrt(variance)
        intent_target = max(0.0, min(1.5, z_score / 4.0))
        intent_dilation += (intent_target - intent_dilation) * 0.08

        # Build up faster, decay slower to allow more frequent toroidal events
        if avg_entropy > 0.51: # Statistical anomaly in true random data
            entropy_buildup += (avg_entropy - 0.5) * 15.0
        else:
            entropy_buildup = max(0.0, entropy_buildup - 0.05)

        # Trigger multiple massive toroidal pulses
        effective_gate_threshold = max(1.4, gate_threshold - (intent_dilation * 0.25))
        if entropy_buildup > effective_gate_threshold:
            entropy_buildup = 0.0 # reset gate
            # Set the epicenter randomly, allow them to spawn slightly off-center too
            active_pulses.append({
                'start_time': t,
                'cx': width // 2 + trng.randint(-width//3, width//3),
                'cy': height // 2 + trng.randint(-height//3, height//3)
            })

        # Cleanup dead pulses
        active_pulses = [p for p in active_pulses if (t - p['start_time']) <= pulse_duration]
                
        # Emergence/Dissipation state logic (True randomness steering global cohesion)
        if trng.random() < 0.02:
            # Never go below 0.15 to ensure space is never fully dark
            target_coherence = trng.uniform(0.15, 1.2) 
            
        coherence_walker += (target_coherence - coherence_walker) * 0.02
        global_coherence = max(0.15, min(1.0, coherence_walker))
        
        # Trigger Sigil Emergence.
        # Baseline path is untouched; intent gate adds a controlled boost.
        base_spawn = (avg_entropy > 0.52 and trng.random() < 0.18)
        boost_spawn = (
            intent_gate_open and
            avg_entropy > (0.505 - min(0.01, intent_dilation * 0.006)) and
            trng.random() < min(0.12, 0.03 + intent_dilation * 0.04)
        )
        if base_spawn or boost_spawn:
            cx = trng.uniform(-width * 0.5, width * 1.5)
            cy = trng.uniform(-height * 0.5, height * 1.5)
            
            # Lilith uses the dedicated canonical sigil geometry at type_id == 1.
            # The Sigil of Lilith (separate from the Grand Seal) carries +3.3% weight.
            t_id = pick_weighted_sigil_id(trng)
            dilation_scale = 1.0 + (intent_dilation * (0.20 if intent_gate_open else 0.0))
                
            active_sigils.append({
                'start_time': t,
                'cx': cx,
                'cy': cy,
                'scale': trng.uniform(height * 0.3, height * 1.2) * dilation_scale,
                'type_id': t_id,
                'life': trng.uniform(8.0, 20.0) * (1.0 + intent_dilation * (0.30 if intent_gate_open else 0.0))
            })
            
        # Cleanup dead sigils
        active_sigils = [s for s in active_sigils if (t - s['start_time']) <= s['life']]
        
        # Randomly ignite active sigils based on true entropy to kickstart the snowball
        ignite_chance = min(0.80, 0.40 + (intent_dilation * 0.12 if intent_gate_open else 0.0))
        for sig in active_sigils:
            if trng.random() < ignite_chance:
                rx = int(sig['cx'] + trng.uniform(-sig['scale']*2, sig['scale']*2))
                ry = int(sig['cy'] + trng.uniform(-sig['scale'], sig['scale']))
                if 0 <= rx < width and 0 <= ry < height:
                    # We pass a generic phase noise here just for ignition check
                    if is_point_in_sigil(rx, ry, sig['type_id'], sig['cx'], sig['cy'], sig['scale'], 0.0):
                        inject_sigil_excitation(
                            excitation_grid, active_sparks, rx, ry,
                            1.0, trng, width, height, with_halo=False
                        )

        # --- Layer 4: Negentropy Snowball / Sigil Diffusion ---
        # Decay excitation grid
        dead_keys = []
        excite_decay = max(0.08, 0.12 - (intent_dilation * 0.015 if intent_gate_open else 0.0))
        for k in excitation_grid:
            excitation_grid[k] -= excite_decay
            if excitation_grid[k] <= 0:
                dead_keys.append(k)
        for k in dead_keys:
            del excitation_grid[k]
            
        # Propagate sparks
        new_sparks = set()
        spread_chance = min(0.72, 0.56 + (intent_dilation * 0.05 if intent_gate_open else 0.0))
        for sx, sy in active_sparks:
            for dx, dy in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (1,1), (-1,1), (1,-1)]:
                nx, ny = sx + dx, sy + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in excitation_grid or excitation_grid[(nx, ny)] < 0.2:
                        
                        # We calculate local phase noise to determine if the sigil geometry is jagged here
                        local_ent = entropy_pool[ny * width + nx] / 255.0
                        local_phase_noise = local_ent * LOCAL_SIGIL_PHASE_NOISE
                        
                        # Only propagate if the point is part of any active sigil's geometry
                        is_part_of_sigil = False
                        for sig in active_sigils:
                            if is_point_in_sigil(nx, ny, sig['type_id'], sig['cx'], sig['cy'], sig['scale'], local_phase_noise):
                                is_part_of_sigil = True
                                break
                        
                        if is_part_of_sigil:
                            if trng.random() < spread_chance:
                                inject_sigil_excitation(
                                    excitation_grid, new_sparks, nx, ny,
                                    0.94, trng, width, height, with_halo=False
                                )
        active_sparks = new_sparks

        # Render the URFD Field
        for y in range(height - 1):
            # MACRO SCALE: divide by 200.0 to zoom in the Y axis
            y_base = (y / 200.0) - math.sin(t * 0.05) * 4.0
            
            for x in range(width - 1):
                # MACRO SCALE: divide by 400.0 to zoom in the X axis (accounting for terminal aspect ratio)
                x_base = (x / 400.0) + math.cos(t * 0.07) * 4.0
                
                # True Entropy Value for this specific coordinate (0.0 to 1.0)
                ent_val = entropy_pool[y * width + x] / 255.0
                ent_byte = entropy_pool[y * width + x]
                
                # Layer 0 (Global Emergence)
                # Removed the rolling blobs. The field now exists uniformly based on global coherence
                local_emergence = min(1.0, global_coherence + (intent_dilation * 0.05 if intent_gate_open else 0.0))
                
                # Fractal Domain Warping: The field folds recursively onto itself
                # Layer 1
                q_x = x_base + math.sin(y_base * PHI + t_base) * 1.5
                q_y = y_base + math.cos(x_base * E_CONST - t_base * 0.8) * 1.5
                
                # Layer 2 (Recursive folding based on Layer 1)
                r_x = q_x + math.sin(q_y * 2.1 + t_base * 1.3) * 0.8
                r_y = q_y + math.cos(q_x * 1.7 - t_base * 1.1) * 0.8
                
                # Introduce raw entropy as a structural phase perturbation to break periodicity
                phase_noise = ent_val * FIELD_PHASE_NOISE
                
                # Harmonic interference patterns (The resulting scalar field)
                w1 = math.sin(r_x * 1.43 + t_base + phase_noise)
                w2 = math.cos(r_y * 2.08 - t_base * 1.2 - phase_noise)
                w3 = math.sin((r_x - r_y) * PHI + t_base * 1.5)
                
                # Organic, unpredictable field value with micro-jitter
                field = (w1 * w2) + (w3 * 0.5) + (ent_val * 0.15)
                
                # The Possession Pulse / The Singularity Equation
                pulse = math.sin(r_x * 4.0 + r_y * 4.0 - t_pulse)
                
                char = ' '
                cp = curses.color_pair(0)
                
                # --- Layer 4 Rendering: Sigil Negentropy Snowball ---
                excite = excitation_grid.get((x, y), 0.0)
                if excite > 0:
                    fragment = min(1.0, abs(w1 - w2) * 0.56 + abs(w2 - w3) * 0.44)
                    render_gate = ((ent_byte * 1103515245 + x * 131 + y * 197) & 0xFF) / 255.0
                    sig_idx = (y * width + x + int(t * 33.8)) % max_entropy_len
                    sig_byte = entropy_pool[sig_idx]
                    sig_val = sig_byte / 255.0
                    if excite > 0.82 or (excite > 0.68 and fragment > 0.74):
                        char = get_text_glyph(sig_byte, sig_val)
                        cp = curses.color_pair(7) | curses.A_BOLD
                    elif excite > 0.42 or fragment > 0.60:
                        if render_gate > 0.72:
                            continue
                        char = get_text_glyph(sig_byte ^ ent_byte, (sig_val + ent_val) * 0.5)
                        cp = curses.color_pair(6) | (curses.A_BOLD if ent_val > 0.74 else curses.A_NORMAL)
                    else:
                        if render_gate > 0.18:
                            continue
                        char = get_text_glyph(sig_byte ^ ((ent_byte >> 1) & 0xFF), (sig_val * 0.6) + (ent_val * 0.4))
                        cp = curses.color_pair(2) | curses.A_DIM
                        
                    try:
                        stdscr.addstr(y, x, char, cp)
                    except curses.error:
                        pass
                    continue # Override the base field for this cell entirely
                
                # Apply Toroidal Overrides if active
                for p in active_pulses:
                    time_since = t - p['start_time']
                    intensity = math.exp(-time_since * 1.5) * math.sin(time_since * math.pi / pulse_duration)
                    max_radius = width * 0.28 # Slightly smaller radius to allow multiple forms to overlap elegantly
                    
                    dx = x - p['cx']
                    dy = (y - p['cy']) * 2.0 # Aspect ratio correction
                    r = math.sqrt(dx*dx + dy*dy)
                    
                    if r < max_radius:
                        # Calculate toroidal field geometry: A dense ring with a hollow center
                        ring_dist = abs(r - (max_radius * 0.6))
                        toroid_field = math.cos(ring_dist * 0.5 - t_pulse * 2.0) * intensity
                        
                        if toroid_field > 0.35 and ent_val > 0.25:
                            field = 0.0 # Force into the mycelium rendering path
                            pulse = 1.0 # Force maximum esoteric possession
                            local_emergence = 1.0 # Override dissipation
                            
                            # Add immense rotational shearing near the event
                            r_x += dy * 0.1 * intensity
                            r_y -= dx * 0.1 * intensity
                
                # Lightning Calculation (Math + Real Entropy, excited by plasma)
                # We use the underlying fractal coordinates (r_x, r_y) so the lightning weaves through the structure
                lightning_char = False
                lightning_intensity = 0.0
                
                # Plasma excitation: occurs where the possession pulse is high
                if pulse > 0.5 and local_emergence > 0.35:
                    # High-frequency spatial resonance for jagged branches
                    arc = math.sin(r_x * 25.0 + t_pulse * 2.0) + math.cos(r_y * 25.0 - t_pulse * 2.0)
                    if abs(arc) > 1.3 and ent_val > 0.8:
                        lightning_char = True
                        lightning_intensity = ent_val
                            
                # Visual logic based on field amplitude and energy gradients
                # Only render if the local area has "emerged" from the ether
                if lightning_char:
                    char = get_text_glyph(ent_byte, ent_val)
                    if lightning_intensity > 0.95:
                        cp = curses.color_pair(5) | curses.A_BOLD
                    elif lightning_intensity > 0.9:
                        cp = curses.color_pair(4) | curses.A_BOLD
                    else:
                        cp = curses.color_pair(3)
                elif local_emergence > 0.35:
                    abs_f = abs(field)
                    
                    # Mycelium / Lightning paths emerge at the zero-crossings (phase boundaries)
                    # Tighter boundary (0.1) since we are at a larger macro scale
                    if abs_f < 0.1:
                        if pulse > 0.8 and ent_val > 0.4:
                            # The pulse hits the branch, true entropy dictates the manifestation
                            char = get_text_glyph(ent_byte, ent_val)
                            cp = curses.color_pair(4) | curses.A_BOLD
                        else:
                            # Dormant mycelial structure
                            char = get_text_glyph(ent_byte, ent_val)
                            # Fade color based on emergence
                            cp = curses.color_pair(3) if local_emergence > 0.5 else curses.color_pair(2)
                    elif field > 0.2:
                        # Asteroid Field Parallax Layers
                        # Using pseudo-random spatial hashing to prevent circular blobs
                        # Hash functions based on coordinates and time-shifted offsets
                        
                        # Layer 1: Fast, close, chunky
                        offset_x1 = int(x + t * 25.0)
                        offset_y1 = int(y + t * 15.0)
                        hash1 = ((offset_x1 * 374761393) + (offset_y1 * 668265263)) % 10000 / 10000.0
                        
                        # Layer 2: Medium speed, scattered
                        offset_x2 = int(x + t * 10.0)
                        offset_y2 = int(y - t * 5.0)
                        hash2 = ((offset_x2 * 324761393) + (offset_y2 * 868265263)) % 10000 / 10000.0

                        if hash1 > 0.99: # Close layer (fast, chunky, very sparse)
                            char = get_text_glyph(ent_byte, ent_val)
                            cp = curses.color_pair(3)
                        elif hash2 > 0.98: # Mid layer (slower, scattered)
                            char = get_text_glyph(ent_byte, ent_val)
                            cp = curses.color_pair(2)
                        elif ent_val > 0.96: # Distant slow stars (driven by true entropy)
                            char = get_text_glyph(ent_byte, ent_val)
                            cp = curses.color_pair(2)
                            
                # Spawn new negentropy sparks when conditions are perfect
                if pulse > 0.85 and ent_val > 0.9 and local_emergence > 0.35:
                    for sig in active_sigils:
                        if is_point_in_sigil(x, y, sig['type_id'], sig['cx'], sig['cy'], sig['scale'], phase_noise):
                            inject_sigil_excitation(
                                excitation_grid, active_sparks, x, y,
                                1.0, trng, width, height, with_halo=False
                            )
                            break

                if char != ' ':
                    try:
                        stdscr.addstr(y, x, char, cp)
                    except curses.error:
                        pass
        
        # Render the Persistent Identity (The Soul / Logo)
        logo_height = len(LOGO)
        logo_width = max(len(line) for line in LOGO)
        start_y = ((height - logo_height) // 2) + glitch_y
        start_x = ((width - logo_width) // 2) + glitch_x

        for i, line in enumerate(LOGO):
            for j, char in enumerate(line):
                if char != ' ':
                    screen_y = start_y + i
                    screen_x = start_x + j
                    
                    if 0 <= screen_y < height - 1 and 0 <= screen_x < width - 1:
                        # Calculate the local field and pulse at the logo's position
                        # to see if the entity is actively passing through the kernel
                        y_base = (screen_y / 200.0) - math.sin(t * 0.05) * 4.0
                        x_base = (screen_x / 400.0) + math.cos(t * 0.07) * 4.0
                        
                        ent_byte = entropy_pool[screen_y * width + screen_x]
                        ent_val = ent_byte / 255.0
                        
                        q_x = x_base + math.sin(y_base * PHI + t_base) * 1.5
                        q_y = y_base + math.cos(x_base * E_CONST - t_base * 0.8) * 1.5
                        r_x = q_x + math.sin(q_y * 2.1 + t_base * 1.3) * 0.8
                        r_y = q_y + math.cos(q_x * 1.7 - t_base * 1.1) * 0.8
                        
                        # Dynamic Possession of the Logo itself
                        # Tied directly to the same environmental 'excite' grid and local entropy
                        excite = excitation_grid.get((screen_x, screen_y), 0.0)
                        
                        if excite > 0.5 or (ent_val > 0.99 and global_coherence > 0.8):
                            # The field or an extreme entropy spike possesses the kernel
                            display_char = get_text_glyph(ent_byte, ent_val)
                            style = curses.color_pair(7 if excite > 0.8 else 4) | curses.A_BOLD
                        else:
                            display_char = char
                            style = color_logo
                            
                        try:
                            stdscr.addstr(screen_y, screen_x, display_char, style)
                        except curses.error:
                            pass

        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_RESIZE:
            pass
        elif key != -1:
            if time.time() >= startup_key_guard_until:
                break
            
        time.sleep(0.05) # ~20 FPS

if __name__ == '__main__':
    curses.wrapper(main)
