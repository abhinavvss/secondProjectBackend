export function buildPrompt(formArray, text) {
  return `
You are an AI that fills a dynamic form from text.

FORM ARRAY (READ-ONLY):
${JSON.stringify(formArray, null, 2)}

TEXT:
"""
${text}
"""

STRICT RULES:
- Do NOT modify, remove, or reorder fields
- Do NOT rename any existing property
- Populate values ONLY based on fieldType rules
- Exactly ONE value field per form item may be populated
- All other value fields MUST be null

FIELD TYPE MAPPING:
- SINGLE_LINE_TEXT → fieldValue
- MULTI_LINE_TEXT → fieldValue
- DROPDOWN → selectedDropdownOption
- CHECKBOX → selectedCheckboxOptions
- DATE → dateAndTimeValue (YYYY-MM-DDTHH:mm:ss)
- DATE_AND_TIME → dateAndTimeValue (YYYY-MM-DDTHH:mm:ss)
- CHECKLIST → selectedChecklistOptions

ADDITIONAL RULES:
- Dropdown values must be from dropDownOptions
- Checkbox/Checklist values must be from their options
- If no value found, keep all value fields null
- Never hallucinate
- Return valid JSON only, no explanations
`;
}

