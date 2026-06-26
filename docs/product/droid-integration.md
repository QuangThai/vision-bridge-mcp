# Droid Integration Guide

**Atlas Vision MCP** integrates with [Factory Droid](https://factorydroid.com/) through **auto-intercept hooks** for text-only models and **MCP tools** for on-demand vision analysis.

## Prerequisites

- Node.js ≥ 20
- Factory Droid CLI
- Vision provider API key (OpenAI, Gemini, etc.)
- Text-only model configuration (`noImageSupport: true`)

## Integration Methods

Droid supports two complementary approaches:

| Method | When to Use | Benefits |
|--------|-------------|----------|
| **Auto-intercept Hooks** | Text-only main model | Automatic image processing, zero manual calls |
| **MCP Tools** | Agent-driven vision | On-demand analysis, explicit tool calls |

### Method 1: Auto-intercept Hooks (Recommended for Text-only Models)

Automatically processes images before they reach your text-only model.

#### Installation

```bash
# Automatic installation
npx atlas-vision-mcp install-hooks droid
```

Or manual setup:

```bash
# Copy hook configuration
mkdir -p ~/.factory
cp examples/hooks/droid-hooks.json ~/.factory/hooks.json

# Or merge with existing hooks
```

#### Configuration

**Step 1: Create Vision Config**

```bash
# Global configuration (recommended)
mkdir -p ~/.config/atlas-vision
cp examples/atlas-vision.env.example ~/.config/atlas-vision/env
```

Edit `~/.config/atlas-vision/env`:

```bash
# Vision provider settings
VISION_API_KEY=sk-your-vision-key
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
VISION_PROVIDER=openai-compatible

# Main model reference (IMPORTANT for Droid)
MAIN_MODEL_REF=deepseek/deepseek-v4-flash
MAIN_MODEL_PROVIDER=deepseek

# Optional clipboard detection (Windows)
ATLAS_CLIPBOARD_DETECT=smart
```

**Step 2: Configure Text-only Model**

In your Droid model configuration, ensure `noImageSupport: true`:

```json
{
  "models": {
    "deepseek-v4-flash": {
      "provider": "deepseek",
      "model": "deepseek-v4-flash", 
      "noImageSupport": true
    }
  }
}
```

#### Hook Configuration

The Droid hooks configuration (`~/.factory/hooks.json`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y atlas-vision-mcp hook user-prompt --client droid",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### Method 2: MCP Tools (Manual)

Exposes vision tools for explicit agent calls.

#### Installation

```bash
droid mcp add atlas-vision "npx -y atlas-vision-mcp" \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini \
  --env ATLAS_ALLOWED_DIRS=. \
  --env ATLAS_REDACT_SECRETS=true
```

#### Available Tools

| Tool | Description | Usage |
|------|-------------|-------|
| `should_use_atlas_vision` | Check model capabilities | Route vision calls |
| `analyze_image` | General image analysis | Screenshots, diagrams |
| `ocr_image` | Text extraction | Documents, error messages |
| `analyze_ui_screenshot` | UI analysis | Frontend mockups |
| `compare_images` | Visual diff | Before/after testing |
| `extract_region` | Region analysis | Focused examination |
| `analyze_image_batch` | Multiple images | Bulk processing |

## Configuration Options

### Provider Settings

**OpenAI Compatible (Default)**
```bash
VISION_PROVIDER=openai-compatible
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
VISION_API_KEY=sk-your-key
```

**DeepSeek Vision (Alternative)**
```bash
VISION_PROVIDER=openai-compatible
VISION_BASE_URL=https://api.deepseek.com/v1
VISION_MODEL=deepseek-vl-7b-chat
VISION_API_KEY=your-deepseek-key
```

**Google Gemini**
```bash
VISION_PROVIDER=gemini
VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VISION_MODEL=gemini-2.0-flash
VISION_API_KEY=your-gemini-key
```

### Model Provider Mapping

For custom Droid providers, map to models.dev format:

```bash
# Droid model ID → models.dev format
MAIN_MODEL_PROVIDER=deepseek       # Maps deepseek-v4-flash → deepseek/deepseek-v4-flash
# MAIN_MODEL_PROVIDER=glm          # Maps glm-5.2 → glm/glm-5.2
# MAIN_MODEL_PROVIDER=openai       # Maps gpt-4o → openai/gpt-4o
```

### Capability Override

```bash
# Force text-only treatment for specific models
ATLAS_INTERCEPT_MODE=text-only-only

# Or explicit model reference
MAIN_MODEL_REF=deepseek/deepseek-v4-flash
```

### Clipboard Integration (Windows)

When Droid blocks image attachments (`noImageSupport: true`), Atlas can read clipboard images:

```bash
# Smart detection (recommended)
ATLAS_CLIPBOARD_DETECT=smart

# Always check clipboard (slower)
ATLAS_CLIPBOARD_DETECT=always

# Disable clipboard detection (default)
# ATLAS_CLIPBOARD_DETECT=off
```

## Verification

### 1. Test Hook Installation

```bash
# Check hook configuration
cat ~/.factory/hooks.json

# Test hook command manually
echo '{"prompt":"analyze ./screenshot.png","model":"deepseek-v4-flash","cwd":"."}' | \
  MAIN_MODEL_REF=deepseek/deepseek-v4-flash \
  npx atlas-vision-mcp hook user-prompt --client droid
```

### 2. Test MCP Tools

```bash
# List available MCP servers
droid mcp list

# Test Atlas Vision tools
droid mcp test atlas-vision should_use_atlas_vision '{"main_model_ref":"deepseek/deepseek-v4-flash"}'
```

### 3. Test Model Capability Detection

```bash
# Check capability resolution
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp doctor

# Test intercept decision
MAIN_MODEL_REF=deepseek/deepseek-v4-flash \
  npx atlas-vision-mcp should-intercept deepseek/deepseek-v4-flash
```

### 4. End-to-End Test

**Auto-intercept Test:**
```bash
# In Droid session with text-only model
"Fix the error shown in ./debug.png"
```

**MCP Tool Test:**
```bash
# Explicit tool call in Droid
use_mcp_tool("atlas-vision", "analyze_image", {"image_path": "./screenshot.png"})
```

## Troubleshooting

### Common Issues

**1. Hooks not firing**

```bash
# Check hooks file exists and is valid JSON
cat ~/.factory/hooks.json
jq . ~/.factory/hooks.json

# Verify hook command accessibility
which npx
npx atlas-vision-mcp --version
```

**2. Model capability detection**

```bash
# Debug model reference resolution
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp doctor

# Check provider mapping
echo "Model: deepseek-v4-flash" 
echo "Provider: $MAIN_MODEL_PROVIDER"
echo "Resolved: $MAIN_MODEL_REF"
```

**3. Clipboard detection not working (Windows)**

```bash
# Test PowerShell clipboard access
powershell.exe -Command "Get-Clipboard -Format Image"

# Enable clipboard detection
export ATLAS_CLIPBOARD_DETECT=smart

# Debug clipboard detection
DEBUG=atlas-vision:clipboard npx atlas-vision-mcp hook user-prompt --client droid
```

**4. Vision API errors**

```bash
# Test provider connectivity
npx atlas-vision-mcp doctor

# Verify API credentials
curl -H "Authorization: Bearer $VISION_API_KEY" \
  "$VISION_BASE_URL/models"
```

### Debug Options

```bash
# Enable detailed logging
DEBUG=atlas-vision:*

# Force intercept for testing
ATLAS_FORCE_INTERCEPT=true

# Skip intercept entirely
ATLAS_SKIP_INTERCEPT=true

# Test specific model
MAIN_MODEL_REF=deepseek/deepseek-v4-flash
```

### Capability Resolution Flow

```text
Hook receives model: "deepseek-v4-flash"
  ↓ MAIN_MODEL_PROVIDER=deepseek
  ↓ Resolve to: deepseek/deepseek-v4-flash  
  ↓ Check models.dev: text-only
  ↓ Decision: INTERCEPT
```

## Advanced Configuration

### Custom Hook Timeout

For slow vision API calls:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y atlas-vision-mcp hook user-prompt --client droid",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

### Multiple Vision Providers

```bash
# Primary + fallback
VISION_PROVIDER=openai-compatible
VISION_API_KEY=sk-primary
VISION_FALLBACK_PROVIDER=gemini  
VISION_FALLBACK_API_KEY=gemini-key
```

### Project-specific Configuration

```bash
# Project-level override (higher priority)
echo "MAIN_MODEL_REF=custom/project-model" > .env
echo "VISION_MODEL=gpt-4o" >> .env
```

## Integration Patterns

### Pattern 1: Pure Auto-intercept

```bash
# Setup for text-only workflow
ATLAS_INTERCEPT_MODE=text-only-only
# No MCP configuration needed
```

### Pattern 2: Hybrid (Hooks + MCP)

```bash
# Auto-intercept for common cases
# + MCP tools for specialized analysis
droid mcp add atlas-vision "npx -y atlas-vision-mcp"
# Also configure hooks
```

### Pattern 3: Smart Routing

```bash
# Let Atlas decide based on model capabilities
ATLAS_INTERCEPT_MODE=auto
# Works with both vision and text-only models
```

## Performance Tips

1. **Use global config** to avoid repeated file reads: `~/.config/atlas-vision/env`
2. **Enable caching** for development: `ATLAS_STORE_HISTORY=true`
3. **Optimize clipboard detection**: Use `smart` instead of `always`
4. **Set appropriate timeouts** for hook operations (120-300s)
5. **Use fallback providers** for reliability

## Security Considerations

- **File system access**: Limit with `ATLAS_ALLOWED_DIRS=./src,./docs`
- **Secret redaction**: Enable with `ATLAS_REDACT_SECRETS=true`  
- **API key security**: Store in `~/.config/atlas-vision/env`, never in project files
- **Clipboard privacy**: Atlas only reads clipboard when image keywords detected (smart mode)

## Model Compatibility

### Recommended Text-only Models

| Model | Provider | Configuration |
|-------|----------|---------------|
| DeepSeek V4 Flash | `deepseek` | `MAIN_MODEL_REF=deepseek/deepseek-v4-flash` |
| GLM-5.2 | `glm` | `MAIN_MODEL_REF=glm/glm-5.2` |
| Qwen-2.5-Coder | `qwen` | `MAIN_MODEL_REF=qwen/qwen-2.5-coder-32b` |

### Vision-capable Models (Auto-skip)

Atlas automatically skips intercept for:
- `cursor/composer-2.5`
- `openai/gpt-4o`  
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash`

## Quick Reference

### Hook Flow
```text
Droid UserPromptSubmit
  ↓ npx atlas-vision-mcp hook user-prompt --client droid
  ↓ Check model capabilities
  ↓ Read clipboard if needed (Windows)
  ↓ Analyze images via vision API
  ↓ Inject evidence into prompt context
  ↓ Text-only model receives enhanced context
```

### Command Shortcuts

```bash
# Quick setup
npx atlas-vision-mcp install-hooks droid

# Quick test
MAIN_MODEL_REF=deepseek/deepseek-v4-flash npx atlas-vision-mcp doctor

# Debug capability
npx atlas-vision-mcp should-intercept deepseek/deepseek-v4-flash
```