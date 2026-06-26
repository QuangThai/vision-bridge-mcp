# Cursor Integration Guide

**Atlas Vision MCP** provides vision capabilities for text-only coding agents in Cursor through two integration methods: **hook-based auto-intercept** for automatic image processing and **MCP tools** for on-demand usage.

## Prerequisites

- Node.js ≥ 20
- Cursor editor
- Vision provider API key (OpenAI, Gemini, etc.)
- Text-only model configuration (when using auto-intercept)

## Integration Methods

### Method 1: Hook-based Auto-intercept (Recommended)

Automatically processes images before they reach your text-only model.

#### Installation

```bash
# Install hooks automatically
npx atlas-vision-mcp install-hooks cursor
```

Or manually copy the hook configuration:

```bash
# Copy hook file to Cursor hooks directory
cp examples/hooks/cursor-hooks.json .cursor/hooks.json
```

#### Configuration

**Option A: Config File (Recommended)**

Create an `atlas-vision.toml` file in your project root:

```bash
npx atlas-vision-mcp config init
```

Edit the generated file:

```toml
[provider]
api_key = "sk-your-api-key"
base_url = "https://api.openai.com/v1"
model = "gpt-4o-mini"
provider = "openai-compatible"

[atlas]
adaptive_detail = true
allowed_dirs = ["."]
```

**Option B: Environment Variables**

Create a global config file:

```bash
mkdir -p ~/.config/atlas-vision
cp examples/atlas-vision.env.example ~/.config/atlas-vision/env
```

Edit `~/.config/atlas-vision/env`:

```bash
# Vision provider (processes images)
VISION_API_KEY=sk-your-vision-key
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
VISION_PROVIDER=openai-compatible

# Main model (optional override)
# MAIN_MODEL_REF=deepseek/deepseek-v4-flash
# CURSOR_UNDERLYING_MODEL=openai/gpt-4o
```

#### Hook Configuration Details

The Cursor hooks configuration includes:

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "npx -y atlas-vision-mcp hook user-prompt --client cursor"
      }
    ],
    "postToolUse": [
      {
        "matcher": "Write",
        "command": "npx -y atlas-vision-mcp hook capture-image"
      }
    ]
  }
}
```

- **beforeSubmitPrompt**: Automatically processes images in your prompts
- **postToolUse**: Captures drag-and-drop images for the next prompt

### Method 2: MCP Tools (On-demand)

Exposes Atlas Vision as MCP tools for manual usage.

#### Installation

Add to your Cursor MCP configuration (usually in VS Code settings or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "atlas-vision": {
      "command": "npx",
      "args": ["-y", "atlas-vision-mcp"],
      "env": {
        "VISION_PROVIDER": "openai-compatible",
        "VISION_BASE_URL": "https://api.openai.com/v1",
        "VISION_API_KEY": "YOUR_KEY",
        "VISION_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

#### Available Tools

| Tool | Description | Use Case |
|------|-------------|----------|
| `should_use_atlas_vision` | Check if main model needs Atlas | Routing decisions |
| `analyze_image` | General image analysis | Screenshots, diagrams, charts |
| `ocr_image` | Extract text from images | Documents, error messages |
| `analyze_ui_screenshot` | UI/mockup analysis | Frontend development |
| `compare_images` | Visual regression testing | Before/after comparisons |
| `extract_region` | Analyze specific image areas | Focused analysis |
| `analyze_image_batch` | Process multiple images | Bulk operations |

## Configuration Options

### Provider Settings

**OpenAI (Default)**
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
```

### Model Capability Override

For text-only models or proxy providers:

```bash
# When using DeepSeek or other text-only models
MAIN_MODEL_REF=deepseek/deepseek-v4-flash

# When Cursor proxy routes to specific upstream model
CURSOR_UNDERLYING_MODEL=openai/gpt-4o
```

### Optional Settings

```bash
# Security
ATLAS_ALLOWED_DIRS=.                    # Allowed read directories
ATLAS_REDACT_SECRETS=true               # Redact API keys in OCR

# Behavior
ATLAS_INTERCEPT_MODE=auto               # auto, text-only-only, always, never
ATLAS_SKIP_INTERCEPT=false              # Disable auto-intercept
ATLAS_FORCE_INTERCEPT=false             # Force intercept even for vision models

# Performance
VISION_MAX_IMAGE_MB=10                  # Max image size before resize
ATLAS_STORE_HISTORY=false              # Enable response caching
```

## Verification

### 1. Check Configuration

```bash
# Show resolved configuration
npx atlas-vision-mcp config

# Verify config file location
npx atlas-vision-mcp config path

# Test provider connectivity
npx atlas-vision-mcp doctor
```

### 2. Test Model Capabilities

```bash
# Check if your model needs Atlas
npx atlas-vision-mcp capabilities cursor/composer-2.5
npx atlas-vision-mcp capabilities deepseek/deepseek-v4-flash

# Debug intercept decisions
npx atlas-vision-mcp should-intercept cursor/composer-2.5
```

### 3. Test Vision Analysis

```bash
# Test image analysis
npx atlas-vision-mcp analyze ./screenshot.png

# Test OCR
npx atlas-vision-mcp ocr ./error-message.png

# Test UI analysis
npx atlas-vision-mcp analyze ./mockup.png --mode ui
```

### 4. Test Hooks (Auto-intercept)

Create a test image and prompt:

```bash
# In Cursor, try prompting with an image path
"Analyze the error in ./screenshots/bug.png"
```

Check if Atlas evidence appears in the conversation context.

## Troubleshooting

### Common Issues

**1. Hooks not working**

```bash
# Check if hooks are properly installed
cat .cursor/hooks.json

# Verify hook command works manually
echo '{"prompt":"test ./image.png","model":"deepseek-v4-flash"}' | \
  npx atlas-vision-mcp hook user-prompt --client cursor
```

**2. Environment variables not loaded**

```bash
# Check config resolution order
npx atlas-vision-mcp config --json

# Verify env file location
ls -la ~/.config/atlas-vision/env
ls -la ./atlas-vision.toml
```

**3. Model capability detection issues**

```bash
# Check model capability resolution
MAIN_MODEL_REF=your-model npx atlas-vision-mcp doctor

# Override capability detection
ATLAS_INTERCEPT_MODE=always npx atlas-vision-mcp doctor
```

**4. Vision API errors**

```bash
# Test provider connectivity
npx atlas-vision-mcp doctor

# Check API key and endpoint
VISION_API_KEY=sk-test npx atlas-vision-mcp doctor
```

### Debug Flags

```bash
# Force intercept for testing
ATLAS_FORCE_INTERCEPT=true

# Skip intercept entirely
ATLAS_SKIP_INTERCEPT=true

# Enable verbose logging
DEBUG=atlas-vision:*

# Test with specific model reference
MAIN_MODEL_REF=deepseek/deepseek-v4-flash
```

### Log Analysis

Hook logs appear in Cursor's developer console:

1. Open Cursor Developer Tools (Help → Developer Tools)
2. Check Console tab for Atlas Vision messages
3. Look for `atlas-vision-evidence` in hook outputs

## Quick Reference

### Cursor Hook Flow

```text
User prompt with image
  ↓ beforeSubmitPrompt hook
  ↓ npx atlas-vision-mcp hook user-prompt --client cursor
  ↓ Model capability check
  ↓ Atlas Vision analysis (if text-only model)
  ↓ Inject <atlas-vision-evidence>
  ↓ Main model receives text context
```

### MCP Tool Usage

```javascript
// Check if Atlas is needed
const needsAtlas = await use_mcp_tool("atlas-vision", "should_use_atlas_vision", {
  main_model_ref: "deepseek/deepseek-v4-flash"
});

// Analyze image if needed
if (needsAtlas.should_use_atlas) {
  const result = await use_mcp_tool("atlas-vision", "analyze_image", {
    image_path: "./screenshot.png",
    mode: "general"
  });
}
```

### Environment Variables Priority

1. `process.env` (shell exports)
2. `ATLAS_VISION_ENV_FILE` (explicit path)
3. `./atlas-vision.toml` (project config file)
4. `~/.config/atlas-vision/config.toml` (global config file)
5. `~/.config/atlas-vision/env` (global env file)
6. `./.env` (project env file)

### Supported Image Formats

- PNG, JPEG, GIF, WebP, BMP
- Maximum size: 20MB (configurable via `VISION_MAX_IMAGE_MB`)
- Automatic resizing for oversized images

## Advanced Configuration

### Fallback Providers

```bash
# Primary + fallback configuration
VISION_PROVIDER=openai-compatible
VISION_API_KEY=sk-primary-key

VISION_FALLBACK_PROVIDER=gemini
VISION_FALLBACK_API_KEY=gemini-key
VISION_FALLBACK_MODEL=gemini-2.0-flash
```

### Model Capability Overrides

Create `model-capabilities.json`:

```json
{
  "deepseek/deepseek-v4-flash": { "supportsVision": false },
  "cursor/composer-2.5": { "supportsVision": true },
  "custom/my-model": { "supportsVision": false }
}
```

```bash
ATLAS_MODEL_CAPABILITIES_FILE=./model-capabilities.json
```

### Custom Prompts

```bash
# Custom analysis prompt for specific use cases
VISION_SYSTEM_PROMPT="Analyze this code screenshot and identify bugs"
```

## Performance Tips

1. **Use config files** instead of env vars for better performance
2. **Enable caching** for repeated image analysis: `ATLAS_STORE_HISTORY=true`
3. **Limit allowed directories** for security: `ATLAS_ALLOWED_DIRS=./src,./docs`
4. **Use appropriate detail levels** for your use case
5. **Consider fallback providers** for reliability

## Security Notes

- Images are sent to your configured vision provider
- Set `ATLAS_ALLOWED_DIRS` to limit file system access
- Use `ATLAS_REDACT_SECRETS=true` to redact API keys in OCR output
- Never commit API keys in config files - use environment variables
- Atlas does not store or log image content by default