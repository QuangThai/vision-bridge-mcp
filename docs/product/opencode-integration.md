# OpenCode Integration Guide

**Atlas Vision MCP** integrates with [OpenCode CLI](https://opencode.ai/) through an **auto-intercept plugin** for seamless image processing and **MCP tools** for on-demand vision analysis.

## Prerequisites

- Node.js ≥ 20
- OpenCode CLI
- Vision provider API key (OpenAI, Gemini, etc.)

## Integration Methods

| Method | Use Case | Benefits |
|--------|----------|----------|
| **Plugin (Auto-intercept)** | Text-only models | Zero MCP calls, automatic processing |
| **MCP Tools** | On-demand analysis | Manual control, explicit tool calls |

### Method 1: Plugin Auto-intercept (Recommended)

The OpenCode plugin automatically detects and processes images before they reach text-only models.

#### Installation

**Step 1: Copy Plugin File**

```bash
# Create plugins directory
mkdir -p ~/.config/opencode/plugins

# Copy plugin file
cp .opencode/plugin.ts ~/.config/opencode/plugins/atlas-vision.ts
```

**Step 2: Configure OpenCode**

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["file:///Users/you/.config/opencode/plugins/atlas-vision.ts"]
}
```

**Windows Path Example:**
```json
{
  "plugin": ["file:///C:/Users/you/.config/opencode/plugins/atlas-vision.ts"]
}
```

#### Configuration

**Method A: Environment Variables**

```bash
# Vision provider settings
export VISION_API_KEY=sk-your-vision-key
export VISION_BASE_URL=https://api.openai.com/v1
export VISION_MODEL=gpt-4o-mini
export VISION_PROVIDER=openai-compatible
```

**Method B: OpenCode JSON Configuration**

Add environment section to `opencode.json`:

```json
{
  "plugin": ["file:///path/to/atlas-vision.ts"],
  "env": {
    "VISION_API_KEY": "sk-your-vision-key",
    "VISION_BASE_URL": "https://api.openai.com/v1",
    "VISION_MODEL": "gpt-4o-mini",
    "VISION_PROVIDER": "openai-compatible"
  }
}
```

#### How the Plugin Works

```text
User message + image
  ↓ chat.message hook (before LLM)
  ↓ Detect image parts/references  
  ↓ Analyze via vision API
  ↓ Replace images with text analysis
  ↓ Text-only model receives clean context
```

The plugin intercepts at the `chat.message` level, processing:
- **File parts** with image extensions
- **Image references** in text (`./screenshot.png`)
- **Markdown images** (`![alt](path.png)`)
- **Clipboard images** (paste/upload)

### Method 2: MCP Tools (Manual)

Exposes Atlas Vision as MCP tools for explicit calls.

#### Installation

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "atlas-vision": {
      "type": "local",
      "command": ["npx", "-y", "atlas-vision-mcp"],
      "enabled": true,
      "environment": {
        "VISION_PROVIDER": "openai-compatible",
        "VISION_BASE_URL": "https://api.openai.com/v1",
        "VISION_API_KEY": "YOUR_KEY",
        "VISION_MODEL": "gpt-4o-mini",
        "ATLAS_ALLOWED_DIRS": ".",
        "ATLAS_REDACT_SECRETS": "true"
      }
    }
  }
}
```

#### Available MCP Tools

| Tool | Description | Usage |
|------|-------------|-------|
| `should_use_atlas_vision` | Check model capabilities | Smart routing |
| `analyze_image` | General analysis | Screenshots, diagrams |
| `ocr_image` | Text extraction | Documents, error messages |
| `analyze_ui_screenshot` | UI analysis | Frontend mockups |
| `compare_images` | Visual comparison | Regression testing |
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

**OpenAI Responses API**
```bash
VISION_PROVIDER=openai-responses  
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o
VISION_API_KEY=sk-your-key
```

**Google Gemini**
```bash
VISION_PROVIDER=gemini
VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VISION_MODEL=gemini-2.0-flash
VISION_API_KEY=your-gemini-key
```

**DeepSeek Vision**
```bash
VISION_PROVIDER=openai-compatible
VISION_BASE_URL=https://api.deepseek.com/v1
VISION_MODEL=deepseek-vl-7b-chat
VISION_API_KEY=your-deepseek-key
```

### Plugin-specific Settings

```bash
# Custom analysis prompt
VISION_PLUGIN_PROMPT="Analyze this image for code issues and bugs"

# Image processing limits
VISION_MAX_IMAGE_MB=20              # Max file size (MB)
VISION_MAX_TOKENS=2048              # Max response tokens

# Plugin behavior
VISION_PLUGIN_DISABLED=1            # Disable plugin temporarily
```

### Security Settings

```bash
# File system access (MCP only)
ATLAS_ALLOWED_DIRS=./src,./docs     # Limit read directories

# Secret redaction
ATLAS_REDACT_SECRETS=true           # Redact API keys in output

# Logging (development only)
ATLAS_LOG_IMAGE_CONTENT=false       # Never log image bytes
```

## Verification

### 1. Test Plugin Installation

```bash
# Check OpenCode recognizes plugin
opencode --help

# Verify plugin file exists
ls -la ~/.config/opencode/plugins/atlas-vision.ts

# Check OpenCode configuration
cat ~/.config/opencode/opencode.json
```

### 2. Test Vision Provider

```bash
# Test connectivity (using MCP command)
npx atlas-vision-mcp doctor

# Test image analysis
npx atlas-vision-mcp analyze ./test-image.png
```

### 3. Test Plugin Functionality

**Method A: Image File Upload**
```bash
# In OpenCode session
"Analyze this screenshot"
# Then upload/attach an image file
```

**Method B: Image Path Reference**
```bash  
# In OpenCode session
"What's wrong with ./debug-screenshot.png?"
```

**Method C: Markdown Image**
```bash
# In OpenCode session  
"Explain this diagram: ![diagram](./architecture.png)"
```

### 4. Test MCP Tools

```bash
# In OpenCode session with MCP configured
use_tool("atlas-vision", "analyze_image", {"image_path": "./screenshot.png"})
```

## Troubleshooting

### Common Issues

**1. Plugin not loading**

```bash
# Check plugin syntax
node -c ~/.config/opencode/plugins/atlas-vision.ts

# Verify OpenCode config syntax
jq . ~/.config/opencode/opencode.json

# Check OpenCode plugin loading
opencode --verbose
```

**2. Environment variables not accessible**

```bash
# Test environment in OpenCode context
echo $VISION_API_KEY

# Add to opencode.json instead of shell env
{
  "env": {
    "VISION_API_KEY": "sk-your-key"
  }
}
```

**3. Image detection not working**

Check plugin logs for:
- File part detection
- Path reference matching  
- Clipboard image processing

Debug with custom prompt:
```bash
VISION_PLUGIN_PROMPT="Debug: describe what you see" opencode
```

**4. Vision API errors**

```bash
# Test API connectivity
curl -H "Authorization: Bearer $VISION_API_KEY" \
  "$VISION_BASE_URL/models"

# Test with minimal request
npx atlas-vision-mcp doctor
```

**5. MCP tools not available**

```bash
# Check MCP server status
# In OpenCode: list_tools()

# Verify MCP configuration
cat ~/.config/opencode/opencode.json | jq .mcp
```

### Debug Options

**Plugin Debugging:**
```bash
# Enable verbose plugin logging (if supported)
DEBUG=opencode:plugin opencode

# Disable plugin temporarily
VISION_PLUGIN_DISABLED=1 opencode
```

**MCP Debugging:**
```bash
# Test MCP server manually
npx atlas-vision-mcp
# Then send MCP protocol messages

# Debug with Atlas CLI
DEBUG=atlas-vision:* npx atlas-vision-mcp doctor
```

## Advanced Configuration

### Hybrid Setup (Plugin + MCP)

Use both plugin for auto-intercept and MCP for specialized tools:

```json
{
  "plugin": ["file:///path/to/atlas-vision.ts"],
  "mcp": {
    "atlas-vision": {
      "type": "local", 
      "command": ["npx", "-y", "atlas-vision-mcp"],
      "environment": {
        "VISION_MODEL": "gpt-4o"
      }
    }
  }
}
```

### Custom Plugin Modification

Edit `~/.config/opencode/plugins/atlas-vision.ts`:

```typescript
// Custom system prompt
const config = {
  systemPrompt: "Focus on code quality and security issues in screenshots"
};

// Custom image detection
function isRelevantImage(filename: string): boolean {
  return /\.(png|jpg|gif)$/i.test(filename) && 
         !filename.includes('ignore');
}
```

### Performance Optimization

```bash
# Faster model for real-time analysis
VISION_MODEL=gpt-4o-mini

# Reduce token usage
VISION_MAX_TOKENS=512

# Enable caching (MCP only)
ATLAS_STORE_HISTORY=true
```

## Integration Patterns

### Pattern 1: Pure Auto-intercept

```json
{
  "plugin": ["file:///path/to/atlas-vision.ts"],
  "env": {
    "VISION_API_KEY": "sk-key"
  }
}
```
Best for: Consistent text-only model usage

### Pattern 2: MCP-only

```json
{
  "mcp": {
    "atlas-vision": { "type": "local", "command": ["npx", "-y", "atlas-vision-mcp"] }
  }
}
```
Best for: Agent-driven vision decisions

### Pattern 3: Conditional Processing

```typescript
// Modified plugin to check model capabilities first
if (shouldUseVisionForModel(currentModel)) {
  return; // Skip plugin processing
}
```

## Quick Reference

### Setup Commands

```bash
# Copy plugin
mkdir -p ~/.config/opencode/plugins
cp .opencode/plugin.ts ~/.config/opencode/plugins/atlas-vision.ts

# Test installation
opencode --version
npx atlas-vision-mcp doctor
```

### Configuration Template

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///Users/you/.config/opencode/plugins/atlas-vision.ts"],
  "env": {
    "VISION_API_KEY": "sk-your-key",
    "VISION_BASE_URL": "https://api.openai.com/v1",
    "VISION_MODEL": "gpt-4o-mini"
  }
}
```

### Plugin Flow

```text  
OpenCode message with image
  ↓ chat.message hook fires
  ↓ Plugin detects image parts
  ↓ Send to vision API
  ↓ Replace image with text analysis  
  ↓ Text-only model processes enhanced context
```

### MCP Tool Usage

```javascript
// Check if vision needed
const result = await use_tool("atlas-vision", "should_use_atlas_vision", {
  main_model_ref: "deepseek/deepseek-v4-flash"
});

// Analyze image
if (result.should_use_atlas) {
  const analysis = await use_tool("atlas-vision", "analyze_image", {
    image_path: "./screenshot.png",
    mode: "general"
  });
}
```

### Supported Image Sources

- **File uploads** via OpenCode interface
- **File paths** in messages (`./screenshot.png`)
- **Markdown images** (`![alt](path)`)
- **Clipboard paste** (automatic detection)
- **Drag & drop** files with image extensions

### Environment Priority

1. `opencode.json` `env` section
2. Shell environment variables  
3. System environment
4. Plugin defaults

## Performance Tips

1. **Use fast models** for real-time feedback: `gpt-4o-mini`
2. **Limit token usage** for cost control: `VISION_MAX_TOKENS=1024`
3. **Optimize image sizes** automatically handled by plugin
4. **Cache responses** when using MCP mode: `ATLAS_STORE_HISTORY=true`
5. **Choose appropriate detail** levels for your use case