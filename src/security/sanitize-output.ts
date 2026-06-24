import type { AnalyzeImageOutput } from "../extraction/schemas.js";
import type { OcrImageOutput } from "../extraction/schemas.js";
import type { AnalyzeUiScreenshotOutput } from "../extraction/schemas.js";
import { buildPromptInjectionWarnings, tagUntrustedText } from "./prompt-injection.js";
import { formatRedactionWarnings, redactSecrets } from "./redact.js";

export interface SanitizeOutputOptions {
  redactSecrets: boolean;
}

export function sanitizeOcrOutput(
  output: OcrImageOutput,
  options: SanitizeOutputOptions,
): OcrImageOutput {
  const redactionFindings = [];
  const visibleText = output.visible_text.map((block) => {
    const redacted = redactSecrets(block.text, options.redactSecrets);
    if (redacted.redacted) {
      redactionFindings.push(...redacted.findings);
    }

    return {
      ...block,
      text: tagUntrustedText(redacted.text),
    };
  });

  const layoutRedacted = redactSecrets(output.layout_text, options.redactSecrets);
  if (layoutRedacted.redacted) {
    redactionFindings.push(...layoutRedacted.findings);
  }

  const summaryRedacted = redactSecrets(output.summary, options.redactSecrets);
  if (summaryRedacted.redacted) {
    redactionFindings.push(...summaryRedacted.findings);
  }

  const warnings = new Set(output.warnings);
  for (const warning of buildPromptInjectionWarnings([
    output.summary,
    layoutRedacted.text,
    ...visibleText.map((block) => block.text),
  ])) {
    warnings.add(warning);
  }

  for (const warning of formatRedactionWarnings(redactionFindings)) {
    warnings.add(warning);
  }

  return {
    ...output,
    summary: summaryRedacted.text,
    layout_text: layoutRedacted.text,
    visible_text: visibleText,
    warnings: [...warnings],
  };
}

export function sanitizeAnalyzeOutput(
  output: AnalyzeImageOutput,
  options: SanitizeOutputOptions,
): AnalyzeImageOutput {
  const textsForInjection: string[] = [output.summary];
  const observations = output.observations.map((observation) => {
    const redacted = redactSecrets(observation.content, options.redactSecrets);
    textsForInjection.push(redacted.text);
    return {
      ...observation,
      content: tagUntrustedText(redacted.text),
    };
  });

  const inferences = output.inferences.map((inference) => {
    const redacted = redactSecrets(inference.content, options.redactSecrets);
    textsForInjection.push(redacted.text);
    return {
      ...inference,
      content: redacted.text,
    };
  });

  const securityNotes = new Set(output.security_notes);
  for (const warning of buildPromptInjectionWarnings(textsForInjection)) {
    securityNotes.add(warning);
  }

  if (options.redactSecrets) {
    const redactedSummary = redactSecrets(output.summary, true);
    if (redactedSummary.redacted) {
      for (const warning of formatRedactionWarnings(redactedSummary.findings)) {
        securityNotes.add(warning);
      }
    }
  }

  return {
    ...output,
    summary: redactSecrets(output.summary, options.redactSecrets).text,
    observations,
    inferences,
    security_notes: [...securityNotes],
  };
}

export function sanitizeUiScreenshotOutput(
  output: AnalyzeUiScreenshotOutput,
  options: SanitizeOutputOptions,
): AnalyzeUiScreenshotOutput {
  const textsForInjection: string[] = [output.summary, output.layout.structure];
  const uiElements = output.ui_elements.map((element) => {
    const label = redactSecrets(element.label, options.redactSecrets);
    const hint = redactSecrets(element.implementation_hint, options.redactSecrets);
    textsForInjection.push(label.text, hint.text);

    return {
      ...element,
      label: tagUntrustedText(label.text),
      implementation_hint: hint.text,
    };
  });

  const layoutStructure = redactSecrets(output.layout.structure, options.redactSecrets);
  const uncertainties = new Set(output.uncertainties);
  for (const warning of buildPromptInjectionWarnings(textsForInjection)) {
    uncertainties.add(warning);
  }

  if (options.redactSecrets && layoutStructure.redacted) {
    for (const warning of formatRedactionWarnings(layoutStructure.findings)) {
      uncertainties.add(warning);
    }
  }

  return {
    ...output,
    summary: redactSecrets(output.summary, options.redactSecrets).text,
    ui_elements: uiElements,
    layout: {
      ...output.layout,
      structure: layoutStructure.text,
    },
    uncertainties: [...uncertainties],
  };
}
