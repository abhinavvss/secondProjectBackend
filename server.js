import dotenv from "dotenv";
dotenv.config();
import bodyParser from "body-parser";
import { v4 as uuid } from "uuid";
import util from "util";

import express from "express";
import routes from "./routes.js";
import cors from "cors";

// Text extraction utility - removes helping verbs and phrases
function extractCleanValue(text, fieldName) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  const lower = text.toLowerCase().trim();
  const fieldNameLower = fieldName.toLowerCase();
  
  // Common patterns to remove
  const patterns = [
    // Name patterns
    new RegExp(`^(his|her|my|the|their|our)\\s+name\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^(his|her|my|the|their|our)\\s+${fieldNameLower}\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^it\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^it\\'s\\s+(.+)$`, 'i'),
    new RegExp(`^that\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^that\\'s\\s+(.+)$`, 'i'),
    new RegExp(`^the\\s+${fieldNameLower}\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^the\\s+${fieldNameLower}\\s+was\\s+(.+)$`, 'i'),
    new RegExp(`^${fieldNameLower}\\s+is\\s+(.+)$`, 'i'),
    new RegExp(`^${fieldNameLower}\\s+was\\s+(.+)$`, 'i'),
    // General patterns
    new RegExp(`^(it|that|this)\\s+(is|was|will be)\\s+(.+)$`, 'i'),
    new RegExp(`^(i|we|they)\\s+(think|believe|know|say|said)\\s+(it\\s+is|that|it)\\s+(.+)$`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[match.length - 1]) {
      const extracted = match[match.length - 1].trim();
      if (extracted.length > 0) {
        console.log(`Extracted value from "${text}" to "${extracted}"`);
        return extracted;
      }
    }
  }
  
  // If no pattern matches, return original
  return text.trim();
}

// Date parsing and formatting utility
function parseAndFormatDate(dateString, fieldType) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  // If already in correct format, return as is
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  const trimmed = dateString.trim();
  if (isoRegex.test(trimmed)) {
    return trimmed;
  }

  try {
    let date;
    const lower = trimmed.toLowerCase();
    const currentYear = new Date().getFullYear();
    
    // Handle relative dates first
    if (lower.includes('today') || lower === 'today') {
      date = new Date();
    } else if (lower.includes('yesterday') || lower === 'yesterday') {
      date = new Date();
      date.setDate(date.getDate() - 1);
    } else if (lower.includes('tomorrow') || lower === 'tomorrow') {
      date = new Date();
      date.setDate(date.getDate() + 1);
    } else {
      // Try formats with month names FIRST (before Date constructor which can be unreliable)
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                         'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      let found = false;
      for (let i = 0; i < monthNames.length && !found; i++) {
        const monthPattern = `(?:${monthNames[i]}|${monthAbbr[i]})`;
        // Match "2 march" or "march 2" or "2 march 2024" or "4 august"
        const pattern = new RegExp(`(\\d{1,2})\\s+${monthPattern}(?:\\s+(\\d{4}))?`, 'i');
        const match = trimmed.match(pattern);
        if (match) {
          const day = match[1];
          const year = match[2] ? parseInt(match[2]) : currentYear;
          date = new Date(`${year}-${String(i + 1).padStart(2, '0')}-${day.padStart(2, '0')}`);
          found = true;
          break;
        }
        // Also try "march 2" format
        const pattern2 = new RegExp(`${monthPattern}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?`, 'i');
        const match2 = trimmed.match(pattern2);
        if (match2) {
          const day = match2[1];
          const year = match2[2] ? parseInt(match2[2]) : currentYear;
          date = new Date(`${year}-${String(i + 1).padStart(2, '0')}-${day.padStart(2, '0')}`);
          found = true;
          break;
        }
      }
      
      // If month name parsing didn't work, try other formats
      if (!found) {
        // Try "DD/MM/YYYY" or "MM/DD/YYYY" - assume MM/DD/YYYY for US format
        const slashMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (slashMatch) {
          const [, month, day, year] = slashMatch;
          date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          found = true;
        }
      }
      
      if (!found) {
        // Try "DD-MM-YYYY" or "MM-DD-YYYY"
        const dashMatch = trimmed.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dashMatch) {
          const [, month, day, year] = dashMatch;
          date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          found = true;
        }
      }
      
      // Last resort: try direct Date parsing
      if (!found) {
        date = new Date(trimmed);
        // If the parsed date seems wrong (year is too far in past/future), use current year
        if (!isNaN(date.getTime())) {
          const parsedYear = date.getFullYear();
          if (parsedYear < 1900 || parsedYear > 2100) {
            // Date constructor might have misinterpreted, try with current year
            const day = date.getDate();
            const month = date.getMonth() + 1;
            date = new Date(`${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
          }
        }
      }
    }
    
    // Check if we have a valid date
    if (!date || isNaN(date.getTime())) {
      console.warn(`Could not parse date: "${dateString}"`);
      return null;
    }
    
    // Format to YYYY-MM-DDTHH:mm:ss
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // For DATE_AND_TIME, include time; for DATE, use 00:00:00
    if (fieldType === "DATE_AND_TIME") {
      // If time was provided in the string, try to extract it
      const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      let hours = '00', minutes = '00', seconds = '00';
      if (timeMatch) {
        hours = String(parseInt(timeMatch[1])).padStart(2, '0');
        minutes = String(parseInt(timeMatch[2])).padStart(2, '0');
        seconds = timeMatch[3] ? String(parseInt(timeMatch[3])).padStart(2, '0') : '00';
      } else {
        // Use current time if no time specified
        hours = String(date.getHours()).padStart(2, '0');
        minutes = String(date.getMinutes()).padStart(2, '0');
        seconds = String(date.getSeconds()).padStart(2, '0');
      }
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    } else {
      // For DATE, use midnight
      return `${year}-${month}-${day}T00:00:00`;
    }
  } catch (error) {
    console.error(`Error parsing date "${dateString}":`, error);
    return null;
  }
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: "2mb" }));

app.use("/api", routes);

const sessions = new Map();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

app.post("/agent/start", (req, res) => {
  const { formDefinition } = req.body;

  const sessionId = uuid();
  const initialConversation = [];
  
  sessions.set(sessionId, {
    sessionId,
    formDefinition,
    formState: {},
    conversation: initialConversation,
    status: "in-progress",
    lastAskedFieldId: null // Track which field was last asked about
  });

  // Find the first required field to ask about
  const firstRequiredField = formDefinition.find(f => f.isRequired);
  const totalRequiredFields = formDefinition.filter(f => f.isRequired).length;
  
  let initialMessage = "Hi there! 👋 I'm here to help you fill out this form. ";
  
  // Set lastAskedFieldId if we're asking about a field
  if (firstRequiredField) {
    const session = sessions.get(sessionId);
    if (session) {
      session.lastAskedFieldId = firstRequiredField.id;
    }
    const fieldName = firstRequiredField.fieldName.toLowerCase();
    if (totalRequiredFields === 1) {
      initialMessage += `I just need one piece of information from you. What's the ${fieldName}?`;
    } else {
      initialMessage += `I'll guide you through ${totalRequiredFields} required fields. Let's start with the ${fieldName} - what would you like to tell me about that?`;
    }
  } else {
    initialMessage += "This form doesn't have any required fields. How can I help you get started?";
  }

  return res.json({
    sessionId,
    message: initialMessage,
  });
});

app.post("/agent/message", async (req, res) => {
  try {
    const { sessionId, userMessage, selectedOption } = req.body;

    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Invalid session" });

    if (userMessage) {
      session.conversation.push({ role: "user", text: userMessage });
    }

    if (selectedOption) {
      session.conversation.push({ role: "user", text: selectedOption });
    }

    const agentDecision = await runAgent(session);

    return res.json(agentDecision);
  } catch (error) {
    console.error("Error in /agent/message:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      type: "CHAT",
      ui: { text: "Sorry, something went wrong. Please try again." }
    });
  }
});

// Add /agent/step endpoint for compatibility with frontend
app.post("/agent/step", async (req, res) => {
  try {
    const { sessionId, userMessage, selectedOption } = req.body;

    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Invalid session" });

    if (userMessage) {
      session.conversation.push({ role: "user", text: userMessage });
    }

    if (selectedOption) {
      session.conversation.push({ role: "user", text: selectedOption });
    }

    const agentDecision = await runAgent(session);

    return res.json(agentDecision);
  } catch (error) {
    console.error("Error in /agent/step:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      type: "CHAT",
      ui: { text: "Sorry, something went wrong. Please try again." }
    });
  }
});

async function runAgent(session) {
  try {
    // Get the last user message
    const lastUserMessage = session.conversation.length > 0 
      ? session.conversation[session.conversation.length - 1].text.trim()
      : "";
    
    // If lastAskedFieldId is not set but we have unfilled required fields, use the first one
    if (!session.lastAskedFieldId && lastUserMessage) {
      const requiredFields = session.formDefinition.filter(f => f.isRequired);
      const unfilledRequiredFields = requiredFields.filter(f => !session.formState[f.id]);
      if (unfilledRequiredFields.length > 0) {
        session.lastAskedFieldId = unfilledRequiredFields[0].id;
        console.log(`Auto-setting lastAskedFieldId to first unfilled required field: ${unfilledRequiredFields[0].fieldName}`);
      }
    }
    
    // AGGRESSIVE FALLBACK: If we asked about a field and user provided a substantial response, force SET_FIELD
    if (session.lastAskedFieldId && lastUserMessage) {
      const lastAskedField = session.formDefinition.find(f => f.id === session.lastAskedFieldId);
      if (lastAskedField && !session.formState[session.lastAskedFieldId]) {
        // Check if message is a simple greeting/question word (exact match only, case insensitive)
        const trimmedMessage = lastUserMessage.trim();
        const isGreetingOrQuestion = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what|when|where|how|why|can you|could you|would you|will you|please|thanks|thank you|yes|no|ok|okay|sure|alright|fine|good|great)$/i.test(trimmedMessage);
        
        // For text fields (SINGLE_LINE_TEXT, MULTI_LINE_TEXT), be VERY lenient - any non-greeting is a value
        const isTextField = lastAskedField.fieldType === "SINGLE_LINE_TEXT" || 
                           lastAskedField.fieldType === "MULTI_LINE_TEXT";
        
        // Check if message looks like a value
        // For text fields: ANY non-greeting response is a value (even single words like "VAIBHAV", "RAMAN")
        // For other fields: need more substantial content
        const hasContent = trimmedMessage.length >= 2;
        const isLikelyValue = isTextField 
          ? (hasContent && !isGreetingOrQuestion)  // Text fields: any non-greeting with 2+ chars
          : (hasContent && !isGreetingOrQuestion && (trimmedMessage.split(/\s+/).length > 1 || trimmedMessage.length > 5)); // Other fields: need more
        
        console.log(`Fallback check: field=${lastAskedField.fieldName}, message="${trimmedMessage}", isGreeting=${isGreetingOrQuestion}, isTextField=${isTextField}, isLikelyValue=${isLikelyValue}`);
        
        if (isLikelyValue) {
          console.log(`AGGRESSIVE FALLBACK: Forcing SET_FIELD for ${lastAskedField.fieldName} with value: "${lastUserMessage}"`);
          // Skip AI call and directly set the field
          let fieldValue = lastUserMessage;
          
          // Extract clean value (remove helping verbs/phrases) for text fields
          if (lastAskedField.fieldType === "SINGLE_LINE_TEXT" || lastAskedField.fieldType === "MULTI_LINE_TEXT") {
            fieldValue = extractCleanValue(fieldValue, lastAskedField.fieldName);
          }
          
          // Parse and format date fields in fallback too
          if (lastAskedField.fieldType === "DATE" || lastAskedField.fieldType === "DATE_AND_TIME") {
            const formattedDate = parseAndFormatDate(fieldValue, lastAskedField.fieldType);
            if (formattedDate) {
              fieldValue = formattedDate;
              console.log(`Fallback: Formatted date from "${lastUserMessage}" to "${fieldValue}"`);
            }
          }
          
          const fieldIdToUpdate = session.lastAskedFieldId; // Save before clearing
          session.formState[fieldIdToUpdate] = fieldValue;
          session.lastAskedFieldId = null; // Clear after saving
          
          // Convert formState to array format for frontend
          const finalUpdatedForm = session.formDefinition.map(field => {
            const storedValue = session.formState[field.id];
            
            if (field.id === lastAskedField.id) {
              return {
                ...field,
                fieldValue: fieldValue || null
              };
            } else {
              return {
                ...field,
                fieldValue: (field.fieldType === "SINGLE_LINE_TEXT" || field.fieldType === "MULTI_LINE_TEXT") ? storedValue || null : null,
                selectedDropdownOption: field.fieldType === "DROPDOWN" ? storedValue || null : null,
                selectedCheckboxOptions: field.fieldType === "CHECKBOX" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
                selectedChecklistOptions: field.fieldType === "CHECKLIST" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
                dateAndTimeValue: (field.fieldType === "DATE" || field.fieldType === "DATE_AND_TIME") ? storedValue || null : null
              };
            }
          });
          
          // Check if there are more required fields
          const requiredFields = session.formDefinition.filter(f => f.isRequired);
          const unfilledRequiredFields = requiredFields.filter(f => !session.formState[f.id]);
          
          if (unfilledRequiredFields.length > 0) {
            const nextField = unfilledRequiredFields[0];
            const nextFieldQuestion = buildAskResponse(nextField, null);
            return {
              type: "FORM_UPDATE",
              form: finalUpdatedForm,
              ui: {
                text: `Got it! I've filled in ${lastAskedField.fieldName}. ${nextFieldQuestion.chat}`,
                options: nextFieldQuestion.ui?.options || null
              }
            };
          } else {
            // All required fields filled
            session.status = "required-complete";
            return {
              type: "FORM_UPDATE",
              form: finalUpdatedForm,
              ui: {
                text: `Perfect! I've filled in ${lastAskedField.fieldName}. 🎉 All required fields are now complete! Would you like to fill out any optional fields, or are you ready to submit the form?`
              }
            };
          }
        }
      }
    }

    const prompt = buildPrompt(session);

    const decision = await callGemini(prompt);
    console.log(util.inspect({decision}, { depth: null, colors: true }));

    // Secondary fallback: If AI still returned MESSAGE/ASK_FIELD but we have a lastAskedField, force SET_FIELD
    if ((decision.action === "MESSAGE" || decision.action === "ASK_FIELD") && session.lastAskedFieldId && lastUserMessage) {
      const lastAskedField = session.formDefinition.find(f => f.id === session.lastAskedFieldId);
      if (lastAskedField && !session.formState[session.lastAskedFieldId]) {
        const isGreetingOrQuestion = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what|when|where|how|why|can you|could you|would you|will you|please|thanks|thank you|yes|no|ok|okay|sure|alright)$/i.test(lastUserMessage);
        const hasContent = lastUserMessage.length > 3 && !isGreetingOrQuestion;
        
        if (hasContent) {
          console.log(`SECONDARY FALLBACK: Forcing SET_FIELD for ${lastAskedField.fieldName} with value: "${lastUserMessage}"`);
          let fieldValue = lastUserMessage;
          
          // Extract clean value (remove helping verbs/phrases) for text fields
          if (lastAskedField.fieldType === "SINGLE_LINE_TEXT" || lastAskedField.fieldType === "MULTI_LINE_TEXT") {
            fieldValue = extractCleanValue(fieldValue, lastAskedField.fieldName);
          }
          
          // Parse and format date fields in secondary fallback too
          if (lastAskedField.fieldType === "DATE" || lastAskedField.fieldType === "DATE_AND_TIME") {
            const formattedDate = parseAndFormatDate(fieldValue, lastAskedField.fieldType);
            if (formattedDate) {
              fieldValue = formattedDate;
              console.log(`Secondary fallback: Formatted date from "${lastUserMessage}" to "${fieldValue}"`);
            }
          }
          
          decision.action = "SET_FIELD";
          decision.payload = {
            fieldId: session.lastAskedFieldId,
            value: fieldValue,
            fieldLabel: lastAskedField.fieldName
          };
        }
      }
    }

    switch (decision.action) {
      case "SET_FIELD":
        // Find the field in formDefinition to get its details
        const fieldToUpdate = session.formDefinition.find(
          f => f.id === decision.payload.fieldId
        );
        
        if (!fieldToUpdate) {
          console.error("Field not found:", decision.payload.fieldId);
          return {
            type: "CHAT",
            ui: {
              text: "I couldn't find that field. Let me help you with the form."
            }
          };
        }

        // Store the value in formState
        let fieldValue = decision.payload.value;
        
        // Extract clean value (remove helping verbs/phrases) for text fields
        if (fieldToUpdate.fieldType === "SINGLE_LINE_TEXT" || fieldToUpdate.fieldType === "MULTI_LINE_TEXT") {
          fieldValue = extractCleanValue(fieldValue, fieldToUpdate.fieldName);
        }
        
        // Parse and format date fields
        if (fieldToUpdate.fieldType === "DATE" || fieldToUpdate.fieldType === "DATE_AND_TIME") {
          const formattedDate = parseAndFormatDate(fieldValue, fieldToUpdate.fieldType);
          if (formattedDate) {
            fieldValue = formattedDate;
            console.log(`Formatted date from "${decision.payload.value}" to "${fieldValue}"`);
          } else {
            console.warn(`Could not parse date value: "${fieldValue}" for field ${fieldToUpdate.fieldName}`);
            // Still store the original value, but it might not be in correct format
          }
        }
        
        // Validate dropdown values
        if (fieldToUpdate.fieldType === "DROPDOWN" && fieldToUpdate.dropDownOptions) {
          // Check if value matches one of the options (case-insensitive)
          const matchingOption = fieldToUpdate.dropDownOptions.find(
            opt => opt.toLowerCase() === String(fieldValue).toLowerCase()
          );
          if (matchingOption) {
            fieldValue = matchingOption; // Use the exact option from the list
          } else if (fieldToUpdate.dropDownOptions.length > 0) {
            console.warn(`Dropdown value "${fieldValue}" doesn't match options. Available: ${fieldToUpdate.dropDownOptions.join(", ")}`);
            // Still store it, but log a warning
          }
        }
        
        session.formState[decision.payload.fieldId] = fieldValue;
        // Clear the last asked field since we've filled it
        session.lastAskedFieldId = null;
        console.log(`Setting field ${fieldToUpdate.fieldName} (${decision.payload.fieldId}) = ${fieldValue}`);

        // Convert formState to array format for frontend with proper field type handling
        const updatedForm = session.formDefinition.map(field => {
          const storedValue = session.formState[field.id];
          
          if (field.id === decision.payload.fieldId) {
            // This is the field we just updated
            switch (field.fieldType) {
              case "DROPDOWN":
                return {
                  ...field,
                  selectedDropdownOption: fieldValue || null,
                  fieldValue: null
                };
              case "CHECKBOX":
                return {
                  ...field,
                  selectedCheckboxOptions: Array.isArray(fieldValue) ? fieldValue : [fieldValue].filter(Boolean),
                  fieldValue: null
                };
              case "CHECKLIST":
                return {
                  ...field,
                  selectedChecklistOptions: Array.isArray(fieldValue) ? fieldValue : [fieldValue].filter(Boolean),
                  fieldValue: null
                };
              case "DATE":
              case "DATE_AND_TIME":
                return {
                  ...field,
                  dateAndTimeValue: fieldValue || null,
                  fieldValue: null
                };
              default:
                return {
                  ...field,
                  fieldValue: fieldValue || null
                };
            }
          } else {
            // Other fields - keep their existing values
            return {
              ...field,
              fieldValue: (field.fieldType === "SINGLE_LINE_TEXT" || field.fieldType === "MULTI_LINE_TEXT") ? storedValue || null : null,
              selectedDropdownOption: field.fieldType === "DROPDOWN" ? storedValue || null : null,
              selectedCheckboxOptions: field.fieldType === "CHECKBOX" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
              selectedChecklistOptions: field.fieldType === "CHECKLIST" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
              dateAndTimeValue: (field.fieldType === "DATE" || field.fieldType === "DATE_AND_TIME") ? storedValue || null : null
            };
          }
        });

        const fieldName = decision.payload.fieldLabel || fieldToUpdate.fieldName || "field";
        
        // Check if all required fields are now filled
        const requiredFields = session.formDefinition.filter(f => f.isRequired);
        const allRequiredFilled = requiredFields.every(f => session.formState[f.id]);
        
        // Check if there are more required fields to fill
        const unfilledRequiredFields = requiredFields.filter(f => !session.formState[f.id]);
        
        // If all required fields are filled and we haven't asked about optional fields yet
        if (allRequiredFilled && session.status !== "required-complete" && session.status !== "optional-phase") {
          session.status = "required-complete";
          return {
            type: "FORM_UPDATE",
            form: updatedForm,
            ui: {
              text: `Perfect! I've filled in ${fieldName}. 🎉 All required fields are now complete! Would you like to fill out any optional fields, or are you ready to submit the form?`
            }
          };
        }
        
        // If there are more required fields, automatically ask about the next one
        if (unfilledRequiredFields.length > 0) {
          const nextField = unfilledRequiredFields[0];
          const nextFieldQuestion = buildAskResponse(nextField, null);
          return {
            type: "FORM_UPDATE",
            form: updatedForm,
            ui: {
              text: `Great! I've filled in ${fieldName}. ${nextFieldQuestion.chat}`,
              options: nextFieldQuestion.ui?.options || null
            }
          };
        }
        
        // If all required fields are filled, return the update
        return {
          type: "FORM_UPDATE",
          form: updatedForm,
          ui: {
            text: `Got it! I've filled in ${fieldName}.`
          }
        };

      case "ASK_FIELD":
        const field = session.formDefinition.find(
          f => f.id === decision.payload.fieldId
        );
        if (!field) {
          return {
            type: "CHAT",
            ui: {
              text: "I couldn't find that field. Let me help you with the form."
            }
          };
        }
        // Track which field we're asking about
        session.lastAskedFieldId = decision.payload.fieldId;
        // If AI provided a conversational question, use it; otherwise use default
        const conversationalQuestion = decision.payload.question || null;
        const askResponse = buildAskResponse(field, conversationalQuestion);
        return {
          type: askResponse.type,
          ui: {
            text: askResponse.chat,
            options: askResponse.ui?.options || null
          }
        };

      case "ASK_OPTIONAL_CONTINUE":
        session.status = "required-complete";
        return {
          type: "CHAT",
          ui: {
            text: decision.payload.text || "Perfect! All required fields are complete. Would you like to fill out any optional fields, or are you ready to submit the form?"
          }
        };

      case "MESSAGE":
        // Check if user wants to continue with optional fields
        const lastMessage = session.conversation.length > 0 
          ? session.conversation[session.conversation.length - 1].text.toLowerCase().trim()
          : "";
        
        const wantsToContinue = lastMessage && (
          lastMessage.includes("yes") || 
          lastMessage.includes("continue") || 
          lastMessage.includes("sure") ||
          lastMessage.includes("ok") ||
          lastMessage.includes("let's") ||
          lastMessage.includes("go ahead") ||
          lastMessage.includes("optional")
        );
        
        const wantsToSubmit = lastMessage && (
          lastMessage.includes("no") || 
          lastMessage.includes("submit") || 
          lastMessage.includes("done") ||
          lastMessage.includes("finish") ||
          lastMessage.includes("that's all") ||
          lastMessage.includes("ready to submit")
        );
        
        // If user wants to continue with optional fields, transition to optional phase
        if (wantsToContinue && session.status === "required-complete") {
          session.status = "optional-phase";
          // The AI should handle asking about the first optional field in its next response
        }
        
        // If user wants to submit, confirm the form
        if (wantsToSubmit && (session.status === "required-complete" || session.status === "optional-phase")) {
          session.status = "completed";
          const finalForm = session.formDefinition.map(field => {
            const storedValue = session.formState[field.id];
            return {
              ...field,
              fieldValue: (field.fieldType === "SINGLE_LINE_TEXT" || field.fieldType === "MULTI_LINE_TEXT") ? storedValue || null : null,
              selectedDropdownOption: field.fieldType === "DROPDOWN" ? storedValue || null : null,
              selectedCheckboxOptions: field.fieldType === "CHECKBOX" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
              selectedChecklistOptions: field.fieldType === "CHECKLIST" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
              dateAndTimeValue: (field.fieldType === "DATE" || field.fieldType === "DATE_AND_TIME") ? storedValue || null : null
            };
          });
          return {
            type: "COMPLETE",
            form: finalForm,
            ui: {
              text: "Perfect! Your form is ready to submit. 🎉"
            }
          };
        }
        
        return {
          type: "CHAT",
          ui: {
            text: decision.payload.text
          }
        };

      case "CONFIRM_FORM":
        session.status = "completed";
        const finalForm = session.formDefinition.map(field => {
          const storedValue = session.formState[field.id];
          return {
            ...field,
            fieldValue: (field.fieldType === "SINGLE_LINE_TEXT" || field.fieldType === "MULTI_LINE_TEXT") ? storedValue || null : null,
            selectedDropdownOption: field.fieldType === "DROPDOWN" ? storedValue || null : null,
            selectedCheckboxOptions: field.fieldType === "CHECKBOX" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
            selectedChecklistOptions: field.fieldType === "CHECKLIST" ? (Array.isArray(storedValue) ? storedValue : storedValue ? [storedValue] : null) : null,
            dateAndTimeValue: (field.fieldType === "DATE" || field.fieldType === "DATE_AND_TIME") ? storedValue || null : null
          };
        });
        return {
          type: "COMPLETE",
          form: finalForm,
          ui: {
            text: "Perfect! Your form is complete and ready to submit. 🎉"
          }
        };

      default:
        return {
          type: "CHAT",
          ui: {
            text: "I'm not sure how to handle that. Can you tell me more?"
          }
        };
    }
  } catch (error) {
    console.error("Error in runAgent:", error);
    return {
      type: "CHAT",
      ui: {
        text: "Sorry, I encountered an error. Please try again."
      }
    };
  }
}


function buildPrompt(session) {
  // Find required fields that haven't been filled
  const requiredFields = session.formDefinition.filter(f => f.isRequired);
  const unfilledRequiredFields = requiredFields.filter(f => !session.formState[f.id]);
  const allRequiredFieldsFilled = requiredFields.length > 0 && requiredFields.every(f => session.formState[f.id]);
  
  // Find optional fields that haven't been filled
  const optionalFields = session.formDefinition.filter(f => !f.isRequired);
  const unfilledOptionalFields = optionalFields.filter(f => !session.formState[f.id]);
  
  // Check if we're in the "continue or submit" phase
  const isAskingAboutOptionalFields = session.status === "required-complete";

  // Get the last user message
  const lastUserMessage = session.conversation.length > 0 
    ? session.conversation[session.conversation.length - 1].text.toLowerCase().trim()
    : "";

  // Check if it's a greeting
  const isGreeting = lastUserMessage && (
    lastUserMessage.includes("hi") || 
    lastUserMessage.includes("hello") || 
    lastUserMessage.includes("hey") ||
    lastUserMessage.includes("good morning") ||
    lastUserMessage.includes("good afternoon") ||
    lastUserMessage.includes("good evening")
  );

  // Check if user wants to continue or submit
  const wantsToContinue = lastUserMessage && (
    lastUserMessage.includes("yes") || 
    lastUserMessage.includes("continue") || 
    lastUserMessage.includes("sure") ||
    lastUserMessage.includes("ok") ||
    lastUserMessage.includes("let's") ||
    lastUserMessage.includes("go ahead")
  );
  
  const wantsToSubmit = lastUserMessage && (
    lastUserMessage.includes("no") || 
    lastUserMessage.includes("submit") || 
    lastUserMessage.includes("done") ||
    lastUserMessage.includes("finish") ||
    lastUserMessage.includes("that's all")
  );

  // Get the last user message for context
  const lastUserMsg = session.conversation.length > 0 
    ? session.conversation[session.conversation.length - 1].text.trim()
    : "";

  return `
You are a warm, friendly, and helpful human-like assistant helping someone fill out a form. Think of yourself as a helpful colleague or friend, not a robot. Be empathetic, encouraging, and make the process feel natural and conversational.

⚠️ CRITICAL RULE - READ THIS FIRST:
If "LAST ASKED FIELD" below is NOT "None" AND the last user message is NOT a greeting (hi/hello/hey) or question word, you MUST use SET_FIELD action immediately. Do NOT ask the question again. Do NOT use MESSAGE. Use SET_FIELD with the LAST ASKED FIELD's id.

FORM DEFINITION:
${JSON.stringify(session.formDefinition)}

CURRENT FORM STATE (what's already filled):
${JSON.stringify(session.formState)}

CONVERSATION HISTORY:
${JSON.stringify(session.conversation)}

UNFILLED REQUIRED FIELDS:
${JSON.stringify(unfilledRequiredFields.map(f => ({ id: f.id, name: f.fieldName, type: f.fieldType })))}

UNFILLED OPTIONAL FIELDS:
${JSON.stringify(unfilledOptionalFields.map(f => ({ id: f.id, name: f.fieldName, type: f.fieldType })))}

LAST ASKED FIELD:
${session.lastAskedFieldId ? JSON.stringify(session.formDefinition.find(f => f.id === session.lastAskedFieldId)) : "None - this is the first question"}

LAST USER MESSAGE: "${lastUserMsg}"

⚠️ IF LAST ASKED FIELD EXISTS AND LAST USER MESSAGE IS NOT A GREETING:
- You MUST use SET_FIELD action
- Use the LAST ASKED FIELD's id as fieldId
- Use the LAST USER MESSAGE as the value (or extract the value from it)
- Do NOT use MESSAGE action
- Do NOT ask the question again

CURRENT STATUS:
- All required fields filled: ${allRequiredFieldsFilled}
- Asking about optional fields: ${isAskingAboutOptionalFields}
- Unfilled required fields remaining: ${unfilledRequiredFields.length}
- Unfilled optional fields remaining: ${unfilledOptionalFields.length}

YOUR BEHAVIOR:
1. Be warm and human-like - use natural language, show personality, be encouraging
2. CRITICAL: When user provides a value (like a name, date, or answer), IMMEDIATELY use SET_FIELD - don't ask follow-up questions
3. After filling a field, acknowledge it warmly and immediately ask about the next required field
4. Keep the conversation flowing - don't wait for the user, proactively guide them
5. If user provides information that matches a field, extract it RIGHT AWAY and use SET_FIELD
6. Show progress: "Great! Just a couple more questions..." or "We're almost done!"
7. Be empathetic: "I know forms can be tedious, but we're making great progress!"

CRITICAL EXTRACTION RULES (HIGHEST PRIORITY):
- If LAST ASKED FIELD is set and user responds with a value (not a greeting or question), use SET_FIELD for that field IMMEDIATELY
- The LAST ASKED FIELD shows you which field the user is likely answering
- Match the user's response to the LAST ASKED FIELD first, then check other unfilled fields
- Don't ask "Is that correct?" or "Can you confirm?" - just fill it and move on
- If user provides a value and LAST ASKED FIELD exists, that's almost certainly the field to fill
- Examples:
  * LAST ASKED FIELD: Fire Chief Name → User says: "Abhinav" → IMMEDIATELY: { "action": "SET_FIELD", "payload": { "fieldId": "f2fb1543-c333-4803-9cdb-679530e66c32", "value": "Abhinav", "fieldLabel": "Fire Chief Name" } }
  * LAST ASKED FIELD: Date of Incident → User says: "March 2" → IMMEDIATELY: { "action": "SET_FIELD", "payload": { "fieldId": "6bdfe965-78e9-42af-8f30-b4759f9a635a", "value": "2024-03-02T00:00:00", "fieldLabel": "Date of Incident" } }

WORKFLOW:
PHASE 1 - Required Fields:
- Keep asking about required fields one by one until ALL are filled
- After each SET_FIELD, immediately ask about the next unfilled required field
- Don't stop until all required fields are complete

PHASE 2 - Optional Fields Decision:
- When ALL required fields are filled, congratulate the user
- Ask if they'd like to fill optional fields or submit now
- Example: "Perfect! All the required information is complete. Would you like to fill out any optional fields, or are you ready to submit the form?"

PHASE 3 - Optional Fields (if user says yes):
- Ask about optional fields one by one
- Be less pushy - "Would you like to add [field name]?" or "Is there anything else you'd like to include?"

ACTION RULES (IN ORDER OF PRIORITY):
1. FIRST PRIORITY - SET_FIELD: 
   - If LAST ASKED FIELD exists and LAST USER MESSAGE is not a greeting/question, you MUST use SET_FIELD
   - If user provides ANY value that matches a field (especially the field you just asked about), use SET_FIELD IMMEDIATELY
   - This is the MOST IMPORTANT rule - extract values as soon as provided
   - Don't ask for confirmation, don't ask follow-up questions - just fill it
   - Include fieldId (exact ID from FORM DEFINITION), value (extracted value), and fieldLabel (field name) in payload
   - Example: LAST ASKED FIELD = Fire Chief Name, LAST USER MESSAGE = "Abhinav" → { "action": "SET_FIELD", "payload": { "fieldId": "f2fb1543-c333-4803-9cdb-679530e66c32", "value": "Abhinav", "fieldLabel": "Fire Chief Name" } }

2. ASK_FIELD: When you need to ask about a specific field - include a conversational "question" in payload
   - Only use this when you're asking a NEW question, not after user provided a value

3. MESSAGE: For greetings, casual conversation, progress updates, asking about optional fields continuation
   - Use this for non-field-related conversation

4. ASK_OPTIONAL_CONTINUE: When all required fields are filled and you need to ask if user wants to continue with optional fields

5. CONFIRM_FORM: When user wants to submit (either after required fields or after optional fields)

RESPONSE FORMAT (return ONLY valid JSON):
{
  "action": "MESSAGE" | "SET_FIELD" | "ASK_FIELD" | "ASK_OPTIONAL_CONTINUE" | "CONFIRM_FORM",
  "payload": {
    // For MESSAGE: { "text": "your friendly response here" }
    // For SET_FIELD: { "fieldId": "field-id", "value": "extracted value", "fieldLabel": "Field Name" }
    // For ASK_FIELD: { "fieldId": "field-id", "question": "conversational question" }
    // For ASK_OPTIONAL_CONTINUE: { "text": "Would you like to fill optional fields or submit?" }
    // For CONFIRM_FORM: {}
  }
}

CRITICAL RULES (FOLLOW IN THIS ORDER):
1. FIRST: If user provides a value (name, date, text, etc.), ALWAYS use SET_FIELD immediately - this is the highest priority
2. After SET_FIELD, if there are still unfilled required fields, the backend will automatically ask about the next field
3. When all required fields are filled for the first time, use ASK_OPTIONAL_CONTINUE
4. If user says they want to continue with optional fields, start asking about them one by one
5. If user says they want to submit, use CONFIRM_FORM
6. Always use exact field IDs from FORM DEFINITION
7. Be proactive - don't wait for the user, guide them through the process

EXAMPLES OF CORRECT BEHAVIOR:
- You ask: "What's the Fire Chief Name?" → User: "Abhinav" → RESPONSE: { "action": "SET_FIELD", "payload": { "fieldId": "f2fb1543-c333-4803-9cdb-679530e66c32", "value": "Abhinav", "fieldLabel": "Fire Chief Name" } }
- You ask: "What's the date?" → User: "March 2" → RESPONSE: { "action": "SET_FIELD", "payload": { "fieldId": "date-field-id", "value": "2024-03-02T00:00:00", "fieldLabel": "Date of Incident" } }
- User says "Hi" (greeting) → RESPONSE: { "action": "MESSAGE", "payload": { "text": "Hello! Let's continue. What's the [next field]?" } }
- All required done: { "action": "ASK_OPTIONAL_CONTINUE", "payload": { "text": "Excellent! All required fields are complete. Would you like to add any optional information, or are you ready to submit?" } }

WRONG BEHAVIOR (DON'T DO THIS):
- You ask: "What's the Fire Chief Name?" → User: "Abhinav" → WRONG: Asking another question or saying "Is that correct?" → CORRECT: Use SET_FIELD immediately
`;
}


function buildAskResponse(field, conversationalQuestion = null) {
  // Use conversational question if provided, otherwise generate a friendly default
  const getQuestion = (defaultQuestion) => {
    if (conversationalQuestion) return conversationalQuestion;
    return defaultQuestion;
  };

  switch (field.fieldType) {
    case "DROPDOWN":
      return {
        type: "ASK",
        chat: getQuestion(`What's the ${field.fieldName.toLowerCase()}?`),
        ui: {
          type: "dropdown",
          options: field.dropDownOptions
        }
      };

    case "CHECKBOX":
      return {
        type: "ASK",
        chat: getQuestion(`Which of these apply for ${field.fieldName.toLowerCase()}?`),
        ui: {
          type: "checkbox",
          options: field.checkBoxOptions
        }
      };

    case "CHECKLIST":
      return {
        type: "ASK",
        chat: getQuestion(`Please select the items that apply for ${field.fieldName.toLowerCase()}:`),
        ui: {
          type: "checklist",
          options: field.checklistOptions
        }
      };

    case "DATE":
    case "DATE_AND_TIME":
      return {
        type: "ASK",
        chat: getQuestion(`What's the ${field.fieldName.toLowerCase()}?`),
        ui: { type: "date" }
      };

    default:
      return {
        type: "ASK",
        chat: getQuestion(`What's the ${field.fieldName.toLowerCase()}?`),
        ui: { type: "text" }
      };
  }
}


async function callGemini(prompt) {
  const { model } = await import("./gemini.js");
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json"
    }
  });
  
  const responseText = result.response.text();
  console.log(util.inspect({responseText}, { depth: null, colors: true }));
  
  return JSON.parse(responseText);
}
