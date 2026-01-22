const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function validateFilledForm(filledForm) {
  for (const field of filledForm) {
    const populated = [
      field.fieldValue,
      field.selectedDropdownOption,
      field.selectedCheckboxOptions,
      field.selectedChecklistOptions,
      field.dateAndTimeValue
    ].filter(v => v !== null && v !== undefined);

    if (populated.length > 1) {
      throw new Error(`Multiple values populated for field ${field.id}`);
    }

    if (field.selectedDropdownOption && field.dropDownOptions) {
      if (!field.dropDownOptions.includes(field.selectedDropdownOption)) {
        throw new Error(`Invalid dropdown value for ${field.fieldName}`);
      }
    }

    if (field.selectedCheckboxOptions && field.checkBoxOptions) {
      for (const v of field.selectedCheckboxOptions) {
        if (!field.checkBoxOptions.includes(v)) {
          throw new Error(`Invalid checkbox value "${v}" for ${field.fieldName}`);
        }
      }
    }

    if (field.selectedChecklistOptions && field.checklistOptions) {
      for (const v of field.selectedChecklistOptions) {
        if (!field.checklistOptions.includes(v)) {
          throw new Error(`Invalid checklist value "${v}" for ${field.fieldName}`);
        }
      }
    }

    if (field.dateAndTimeValue) {
      if (!DATE_REGEX.test(field.dateAndTimeValue)) {
        throw new Error(`Invalid date format for ${field.fieldName}`);
      }
    }
  }
}

