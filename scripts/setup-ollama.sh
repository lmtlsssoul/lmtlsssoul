#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# lmtlss soul — Ollama GPU Setup Script
# Optimized for: i5 CPU | 4GB GPU (NVIDIA/AMD) | 8GB RAM
# This script installs Ollama and pulls models appropriate for your hardware.
# ──────────────────────────────────────────────────────────────────────────────
set -e

GREEN='\033[38;2;74;246;38m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "${GREEN}◉${RESET} $*"; }
dim()  { echo -e "${DIM}  $*${RESET}"; }
warn() { echo -e "${GREEN}⚠${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }

echo ""
echo -e "${GREEN}${BOLD}lmtlss soul — Ollama GPU Setup${RESET}"
echo -e "${DIM}  presence.${RESET}"
echo ""

# ── 1. Install Ollama ─────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  ok "Ollama already installed: $(ollama --version 2>/dev/null || echo 'version unknown')"
else
  log "Installing Ollama..."
  if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    curl -fsSL https://ollama.ai/install.sh | sh
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
      brew install ollama
    else
      warn "Homebrew not found. Install from https://ollama.ai"
      exit 1
    fi
  else
    warn "Unsupported OS. Install Ollama manually from https://ollama.ai"
    exit 1
  fi
  ok "Ollama installed."
fi

# ── 2. Detect GPU ─────────────────────────────────────────────────────────────
log "Detecting GPU..."

VRAM_MB=0
GPU_TYPE="cpu"

# NVIDIA detection
if command -v nvidia-smi &>/dev/null; then
  VRAM_LINE=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
  if [[ -n "$VRAM_LINE" ]]; then
    VRAM_MB=$VRAM_LINE
    GPU_TYPE="nvidia"
    ok "NVIDIA GPU detected: ${VRAM_MB}MB VRAM"
  fi
fi

# AMD detection (ROCm)
if [[ "$GPU_TYPE" == "cpu" ]] && command -v rocm-smi &>/dev/null; then
  VRAM_LINE=$(rocm-smi --showmeminfo vram --noheader 2>/dev/null | grep -oP '\d+' | head -1)
  if [[ -n "$VRAM_LINE" ]]; then
    VRAM_MB=$((VRAM_LINE / 1024 / 1024))
    GPU_TYPE="amd"
    ok "AMD GPU detected: ${VRAM_MB}MB VRAM"
  fi
fi

if [[ "$GPU_TYPE" == "cpu" ]]; then
  warn "No GPU detected — using CPU mode (slower inference)"
fi

# ── 3. Set Ollama environment ─────────────────────────────────────────────────
log "Configuring Ollama environment..."

# For 4GB GPU: maximize GPU layers, use quantized models
OLLAMA_ENV_FILE="${HOME}/.ollama/env"
mkdir -p "${HOME}/.ollama"

cat > "$OLLAMA_ENV_FILE" << 'EOF'
# lmtlss soul — Ollama configuration
# Optimized for 4GB GPU, i5 CPU, 8GB RAM

# Keep models loaded in VRAM (avoids reload latency)
OLLAMA_KEEP_ALIVE=10m

# Max VRAM usage (leave ~200MB for OS)
OLLAMA_GPU_OVERHEAD=200000000

# Number of parallel requests (1 for low RAM)
OLLAMA_NUM_PARALLEL=1

# Flash attention for better memory efficiency
OLLAMA_FLASH_ATTENTION=1
EOF

# Add to shell profile if not already present
for PROFILE in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
  if [[ -f "$PROFILE" ]] && ! grep -q "OLLAMA_KEEP_ALIVE" "$PROFILE"; then
    echo "" >> "$PROFILE"
    echo "# lmtlss soul — Ollama" >> "$PROFILE"
    echo "export OLLAMA_KEEP_ALIVE=10m" >> "$PROFILE"
    echo "export OLLAMA_FLASH_ATTENTION=1" >> "$PROFILE"
    echo "export OLLAMA_NUM_PARALLEL=1" >> "$PROFILE"
    dim "Added Ollama env vars to $PROFILE"
  fi
done

ok "Ollama environment configured."

# ── 4. Start Ollama daemon ────────────────────────────────────────────────────
log "Starting Ollama daemon..."
if ! pgrep -x ollama &>/dev/null; then
  ollama serve &>/dev/null &
  sleep 3
  ok "Ollama daemon started."
else
  ok "Ollama daemon already running."
fi

# ── 5. Select and pull models for 4GB GPU ────────────────────────────────────
# Model selection matrix for 4GB VRAM / 8GB RAM:
#
# Best models for this hardware profile:
#   phi3:mini       — 3.8B params, 2.3GB @ Q4, fast, very capable
#   llama3.2:3b     — 3B params, 1.9GB @ Q4, good all-rounder
#   llama3.2:1b     — 1B params, 0.8GB @ Q4, fastest, use for scraper
#   mistral:7b-q4   — 7B params, 4.1GB @ Q4, tight fit but possible
#   deepseek-r1:1.5b — 1.5B reasoning model, 0.9GB @ Q4

echo ""
log "Selecting models for 4GB GPU..."
echo ""

echo -e "  ${GREEN}Recommended models for your hardware:${RESET}"
echo -e "  ${DIM}1. phi3:mini     (3.8B, ~2.3GB) — Best balance: interface + reflection${RESET}"
echo -e "  ${DIM}2. llama3.2:3b   (3B, ~1.9GB)   — Good all-rounder: orchestrator${RESET}"
echo -e "  ${DIM}3. llama3.2:1b   (1B, ~0.8GB)   — Fastest: scraper + compiler${RESET}"
echo ""
echo -e "  ${DIM}Total: ~5GB across all models (loaded on demand, not all at once)${RESET}"
echo ""

# Ask which models to pull
read -r -p "$(echo -e "${GREEN}Pull recommended models? [Y/n]:${RESET} ")" CONFIRM
CONFIRM=${CONFIRM:-Y}

if [[ "${CONFIRM^^}" == "Y" ]]; then
  log "Pulling phi3:mini (interface + reflection)..."
  ollama pull phi3:mini

  log "Pulling llama3.2:3b (orchestrator)..."
  ollama pull llama3.2:3b

  log "Pulling llama3.2:1b (scraper + compiler)..."
  ollama pull llama3.2:1b

  ok "All recommended models pulled."
else
  warn "Skipped model pull. Run manually: ollama pull phi3:mini"
fi

# ── 6. Configure lmtlss soul role assignments ─────────────────────────────────
echo ""
log "Configuring lmtlss soul role assignments..."

SOUL_STATE_DIR="${LMTLSS_STATE_DIR:-${HOME}/.lmtlss}"
mkdir -p "$SOUL_STATE_DIR"

ASSIGNMENTS_FILE="${SOUL_STATE_DIR}/role-assignments.json"

if [[ "${CONFIRM^^}" == "Y" ]]; then
  cat > "$ASSIGNMENTS_FILE" << 'EOF'
{
  "interface": "ollama:phi3:mini",
  "compiler": "ollama:llama3.2:1b",
  "orchestrator": "ollama:llama3.2:3b",
  "scraper": "ollama:llama3.2:1b",
  "reflection": "ollama:phi3:mini"
}
EOF
  ok "Role assignments configured: ${ASSIGNMENTS_FILE}"
  echo ""
  echo -e "  ${DIM}interface  → ollama:phi3:mini   (most capable, highest quality)${RESET}"
  echo -e "  ${DIM}reflection → ollama:phi3:mini   (deep thinking for distillation)${RESET}"
  echo -e "  ${DIM}orchestrator → ollama:llama3.2:3b  (goal decomposition)${RESET}"
  echo -e "  ${DIM}compiler   → ollama:llama3.2:1b  (validation, fast)${RESET}"
  echo -e "  ${DIM}scraper    → ollama:llama3.2:1b  (research tasks, fast)${RESET}"
fi

# ── 7. GPU layer optimization tips ───────────────────────────────────────────
echo ""
log "GPU Optimization Tips:"
echo ""
echo -e "  ${DIM}Set GPU layers explicitly for best performance:${RESET}"
echo -e "  ${DIM}  OLLAMA_NUM_GPU=99  # Use all available GPU layers${RESET}"
echo ""
echo -e "  ${DIM}For phi3:mini on 4GB GPU, all layers fit in VRAM (~2.3GB).${RESET}"
echo -e "  ${DIM}For llama3.2:3b, most layers fit (~1.9GB).${RESET}"
echo -e "  ${DIM}For larger models, some layers will offload to CPU RAM.${RESET}"
echo ""
echo -e "  ${DIM}Monitor GPU usage: watch -n1 nvidia-smi${RESET}"
echo -e "  ${DIM}Ollama logs:       journalctl -u ollama -f${RESET}"
echo ""

# ── 8. Verify ─────────────────────────────────────────────────────────────────
log "Verifying Ollama connection..."
if curl -s http://localhost:11434/api/tags &>/dev/null; then
  MODELS=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
  ok "Ollama is running. Available models: ${MODELS:-none}"
else
  warn "Ollama not responding on port 11434. Start with: ollama serve"
fi

echo ""
echo -e "${GREEN}${BOLD}Setup complete.${RESET}"
echo ""
echo -e "  Next steps:"
echo -e "  ${DIM}1. soul birth          — Birth a new soul${RESET}"
echo -e "  ${DIM}2. soul start          — Start the daemon + web dashboard${RESET}"
echo -e "  ${DIM}3. soul chat           — Interactive terminal conversation${RESET}"
echo -e "  ${DIM}4. Open browser:       http://localhost:3000${RESET}"
echo ""
echo -e "${GREEN}  presence.${RESET}"
echo ""
