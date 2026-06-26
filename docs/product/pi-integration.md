# Pi Integration Guide

**Atlas Vision MCP** provides seamless auto-intercept integration with [Pi Coding Agent](https://github.com/anomalyco/opencode) through a native extension that processes images before text-only models see them.

## Prerequisites

- Node.js ≥ 20  
- Pi coding agent
- Vision provider API key (OpenAI, Gemini, etc.)

## Integration Method: Native Extension

Pi uses a **native extension** approach rather than hooks or MCP tools. The extension automatically detects when your model lacks vision support and processes attached images in-process.

### Installation

**Production Install (Recommended)**
```bash
pi install npm:atlas-vision-mcp
```

**Project-local Install**
```bash
pi install -l npm:atlas-vision-mcp
```

**Try Without Installing**
```bash
pi -e npm:atlas-vision-mcp
```

## Configuration

### Auto-loading Environment Files

The Pi extension automatically loads configuration from these locations (first found wins):

| Priority | Location | Scope |
|----------|----------|-------|
| 1 | `$ATLAS_VISION_ENV_FILE` | Explicit override |
| 2 | `~/.config/atlas-vision/env` | Global (all projects) |
| 3 | `{project}/.env` | Project root |

**Existing `process.env` values always take priority over file values.**

### Method 1: Project Configuration (Recommended)

Create a `.env` file in your project root:

```bash
cp examples/atlas-vision.env.example .env
```

Edit `.env`:

```bash
# Vision provider (processes images)
VISION_API_KEY=sk-your-vision-key
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
VISION_PROVIDER=openai-compatible

# Optional: main model override (usually auto-detected)
# MAIN_MODEL_REF=deepseek/deepseek-v4-flash

# Optional: behavior flags
# ATLAS_SKIP_INTERCEPT=false
# ATLAS_FORCE_INTERCEPT=false
```

### Method 2: Global Configuration

Create a global config (shared across all Pi projects):

```bash
mkdir -p ~/.config/atlas-vision
cp examples/atlas-vision.env.example ~/.config/atlas-vision/env
```

Edit `~/.config/atlas-vision/env` with your API keys.

### Method 3: Config File (Alternative)

Use TOML config instead of env files:

```bash
# Create config file
npx atlas-vision-mcp config init

# Edit atlas-vision.toml
```

```toml
[provider]
api_key = "sk-your-vision-key"
base_url = "https://api.openai.com/v1"
model = "gpt-4o-mini"
provider = "openai-compatible"

[atlas]
adaptive_detail = true
allowed_dirs = ["."]
```

## How It Works

```text
User prompt + attached images
  ↓ Pi extension: before_agent_start
  ↓ ctx.model.input lacks "image"?
  ↓ Atlas analyzes images in-process
  ↓ Inject <atlas-vision-evidence> message
  ↓ Main model continues with text evidence
```

### Automatic Model Detection

The extension uses Pi's runtime model context for authoritative capability detection:

```javascript
// Pi provides absolute truth about model capabilities
ctx.model.input = ["text"]        // Text-only → Atlas intercepts
ctx.model.input = ["text", "image"]  // Vision-capable → Atlas skips
```

This means **no manual configuration needed** for model capabilities in most cases.

## Configuration Options

### Required Variables

```bash
VISION_API_KEY=your-key              # Vision provider API key
VISION_BASE_URL=https://api.openai.com/v1  # Provider endpoint
VISION_MODEL=gpt-4o-mini             # Vision model
VISION_PROVIDER=openai-compatible    # Provider type
```

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAIN_MODEL_REF` | auto-detected | Override model ref (e.g., `deepseek/deepseek-v4-flash`) |
| `MAIN_MODEL_PROVIDER` | inferred | Provider ID (`deepseek`, `glm`, `openai`) |
| `ATLAS_SKIP_INTERCEPT` | `false` | Disable auto-intercept entirely |
| `ATLAS_FORCE_INTERCEPT` | `false` | Force intercept even for vision models |
| `ATLAS_ALLOWED_DIRS` | `.` | Comma-separated allowed read directories |
| `ATLAS_REDACT_SECRETS` | `true` | Redact API keys in OCR output |
| `VISION_MAX_IMAGE_MB` | `10` | Max image size before resize |

### Provider Configurations

**OpenAI Compatible (Default)**
```bash
VISION_PROVIDER=openai-compatible
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
```

**OpenAI Responses API**
```bash
VISION_PROVIDER=openai-responses
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o
```

**Google Gemini**
```bash
VISION_PROVIDER=gemini
VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VISION_MODEL=gemini-2.0-flash
VISION_API_KEY=your-gemini-key
```

**Fallback Provider**
```bash
# Primary provider
VISION_PROVIDER=openai-compatible
VISION_API_KEY=sk-primary

# Fallback when primary fails
VISION_FALLBACK_PROVIDER=gemini
VISION_FALLBACK_API_KEY=gemini-key
VISION_FALLBACK_MODEL=gemini-2.0-flash
```

## Verification

### 1. Check Configuration

```bash
# Show resolved configuration
npx atlas-vision-mcp config

# Show config file path
npx atlas-vision-mcp config path

# Test provider connectivity
npx atlas-vision-mcp doctor
```

### 2. Test Model Capabilities

```bash
# Check specific model capability (uses MAIN_MODEL_REF)
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp capabilities deepseek/deepseek-v4-flash

# Debug intercept decision
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp should-intercept deepseek/deepseek-v4-flash
```

### 3. Test Vision Analysis

```bash
# Test image analysis
npx atlas-vision-mcp analyze ./screenshot.png

# Test OCR
npx atlas-vision-mcp ocr ./document.png

# Test UI analysis  
npx atlas-vision-mcp analyze ./mockup.png --mode ui
```

### 4. Test Extension Integration

Start Pi with your configuration:

```bash
# With project .env
pi

# Or with explicit extension
pi -e npm:atlas-vision-mcp
```

Try prompting with an image:
- Attach an image file to your prompt
- Or reference an image path: "Analyze the error in ./screenshot.png"
- Look for `<atlas-vision-evidence>` in the conversation

## Development Setup

When developing in this repository:

```bash
# Build the distribution
pnpm build

# Start Pi (loads from .pi/extensions/)
pi   # Extension imports ../dist/index.js
```

The extension requires the built `dist/` directory because it imports the library API.

## Troubleshooting

### Common Issues

**1. Extension not loading**

```bash
# Check if extension is installed
pi extensions list

# Try installing fresh
pi uninstall atlas-vision-mcp
pi install npm:atlas-vision-mcp
```

**2. Environment variables not loading**

```bash
# Check config resolution
npx atlas-vision-mcp config --json

# Verify env file exists and is readable  
ls -la .env
ls -la ~/.config/atlas-vision/env
cat ~/.config/atlas-vision/env
```

**3. Model capability detection**

```bash
# Debug with specific model
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp doctor

# Check Pi model context (in Pi session)
# Look for model.input array in conversation
```

**4. Vision API errors**

```bash
# Test provider connectivity
npx atlas-vision-mcp doctor

# Test with different model
VISION_MODEL=gpt-4o-mini npx atlas-vision-mcp doctor

# Check API key format
echo $VISION_API_KEY | head -c 10  # Should start with 'sk-'
```

**5. Images not being processed**

Check Pi status indicator:
- Extension sets status to "atlas: auto intercept" on startup
- Status changes to "atlas: analyzing image(s)..." during processing
- Status clears when complete

### Debug Options

```bash
# Force intercept for testing
ATLAS_FORCE_INTERCEPT=true pi

# Skip intercept entirely  
ATLAS_SKIP_INTERCEPT=true pi

# Enable detailed logging
DEBUG=atlas-vision:* pi

# Test with specific model reference
MAIN_MODEL_REF=deepseek/deepseek-v4-flash pi
```

### Extension Loading Priority

Pi loads extensions in this order:
1. `.pi/extensions/` (local development)  
2. `node_modules/atlas-vision-mcp/extensions/` (installed package)
3. Global pi extensions directory

## Advanced Features

### Custom Prompts

Override the default vision analysis prompt:

```bash
ATLAS_VISION_PROMPT="Analyze this image focusing on code quality and potential bugs"
```

### Caching

Enable response caching for development:

```bash
ATLAS_STORE_HISTORY=true
```

View cache statistics:
```bash
npx atlas-vision-mcp cache stats
npx atlas-vision-mcp cache clear
```

### Cost Tracking

Monitor vision API usage:

```bash
# Enable cost tracking
ATLAS_TRACK_COSTS=true

# View costs
npx atlas-vision-mcp costs --today
npx atlas-vision-mcp costs --session
```

### Session Images

Extension automatically persists attached images to session directories for later reference.

## Comparison with Other Integration Methods

| Method | Pi Extension | Hooks | MCP Tools |
|--------|-------------|-------|-----------|
| **Automation** | Automatic | Automatic | Manual |
| **Setup** | `pi install` | Hook config | MCP config |
| **Performance** | In-process | Shell process | stdio IPC |
| **Model awareness** | Native Pi context | Hook model field | Agent decision |
| **Use case** | Pi users | Other agents | On-demand tools |

## Quick Reference

### Installation Commands
```bash
# Install extension
pi install npm:atlas-vision-mcp

# Create config
cp examples/atlas-vision.env.example .env

# Verify setup
npx atlas-vision-mcp doctor
```

### Environment File Template
```bash
# ~/.config/atlas-vision/env or ./.env
VISION_API_KEY=sk-your-key
VISION_BASE_URL=https://api.openai.com/v1  
VISION_MODEL=gpt-4o-mini
VISION_PROVIDER=openai-compatible
```

### Status Indicators
- `atlas: auto intercept` - Extension loaded, ready
- `atlas: analyzing image(s)...` - Processing images  
- `atlas: force intercept` - Force mode enabled

### Model Capability Check
```bash
# Quick capability test
MAIN_MODEL_REF=your-model npx atlas-vision-mcp should-intercept your-model
```

### Extension Flow
```text
Pi starts → Extension loads env → User attaches image → 
before_agent_start hook → Check ctx.model.input →
No "image" capability? → Analyze via Atlas → 
Inject evidence → Model gets text context
```