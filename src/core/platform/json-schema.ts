export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonSchemaBase = {
  description?: string;
  enum?: readonly JsonValue[];
};

export type StringJsonSchema = JsonSchemaBase & {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

export type NumberJsonSchema = JsonSchemaBase & {
  type: "number" | "integer";
  minimum?: number;
  maximum?: number;
};

export type BooleanJsonSchema = JsonSchemaBase & {
  type: "boolean";
};

export type NullJsonSchema = JsonSchemaBase & {
  type: "null";
};

export type ArrayJsonSchema = JsonSchemaBase & {
  type: "array";
  items: JsonSchema;
  minItems?: number;
  maxItems?: number;
};

export type ClosedJsonObjectSchema = JsonSchemaBase & {
  type: "object";
  properties: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties: false;
};

export type JsonSchema =
  | StringJsonSchema
  | NumberJsonSchema
  | BooleanJsonSchema
  | NullJsonSchema
  | ArrayJsonSchema
  | ClosedJsonObjectSchema;

export class SchemaDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaDefinitionError";
  }
}

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export function assertClosedJsonObjectSchema(
  schema: ClosedJsonObjectSchema,
  context = "Input schema",
): void {
  if (!isRecord(schema) || schema.type !== "object") {
    throw new SchemaDefinitionError(`${context} must be an object schema.`);
  }

  if (schema.additionalProperties !== false) {
    throw new SchemaDefinitionError(
      `${context} must set additionalProperties to false.`,
    );
  }

  if (!isRecord(schema.properties)) {
    throw new SchemaDefinitionError(`${context} must define properties.`);
  }

  const propertyNames = new Set(Object.keys(schema.properties));
  for (const requiredProperty of schema.required ?? []) {
    if (!propertyNames.has(requiredProperty)) {
      throw new SchemaDefinitionError(
        `${context} requires unknown property "${requiredProperty}".`,
      );
    }
  }

  for (const [propertyName, propertySchema] of Object.entries(
    schema.properties,
  )) {
    assertJsonSchema(propertySchema, `${context}.${propertyName}`);
  }
}

export function validateClosedJsonObjectInput(
  schema: ClosedJsonObjectSchema,
  input: unknown,
  context = "Input",
): asserts input is Record<string, JsonValue> {
  assertClosedJsonObjectSchema(schema, `${context} schema`);
  validateJsonValue(schema, input, context);
}

function assertJsonSchema(schema: JsonSchema, context: string): void {
  if (!isRecord(schema) || typeof schema.type !== "string") {
    throw new SchemaDefinitionError(`${context} must define a schema type.`);
  }

  if (schema.enum && !Array.isArray(schema.enum)) {
    throw new SchemaDefinitionError(`${context}.enum must be an array.`);
  }

  switch (schema.type) {
    case "object":
      assertClosedJsonObjectSchema(schema, context);
      break;
    case "array":
      assertJsonSchema(schema.items, `${context}[]`);
      break;
    case "string":
    case "number":
    case "integer":
    case "boolean":
    case "null":
      break;
    default:
      throw new SchemaDefinitionError(
        `${context} uses unsupported schema type "${String((schema as { type: unknown }).type)}".`,
      );
  }
}

function validateJsonValue(
  schema: JsonSchema,
  value: unknown,
  context: string,
): void {
  if (schema.enum && !schema.enum.some((entry) => jsonValuesEqual(entry, value))) {
    throw new SchemaValidationError(
      `${context} must be one of the declared values.`,
    );
  }

  switch (schema.type) {
    case "string":
      validateString(schema, value, context);
      return;
    case "number":
    case "integer":
      validateNumber(schema, value, context);
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new SchemaValidationError(`${context} must be a boolean.`);
      }
      return;
    case "null":
      if (value !== null) {
        throw new SchemaValidationError(`${context} must be null.`);
      }
      return;
    case "array":
      validateArray(schema, value, context);
      return;
    case "object":
      validateObject(schema, value, context);
  }
}

function validateString(
  schema: StringJsonSchema,
  value: unknown,
  context: string,
): void {
  if (typeof value !== "string") {
    throw new SchemaValidationError(`${context} must be a string.`);
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw new SchemaValidationError(
      `${context} must contain at least ${schema.minLength} characters.`,
    );
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new SchemaValidationError(
      `${context} must contain at most ${schema.maxLength} characters.`,
    );
  }
  if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
    throw new SchemaValidationError(`${context} does not match its pattern.`);
  }
}

function validateNumber(
  schema: NumberJsonSchema,
  value: unknown,
  context: string,
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (schema.type === "integer" && !Number.isInteger(value))
  ) {
    throw new SchemaValidationError(
      `${context} must be ${schema.type === "integer" ? "an integer" : "a number"}.`,
    );
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw new SchemaValidationError(
      `${context} must be at least ${schema.minimum}.`,
    );
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw new SchemaValidationError(
      `${context} must be at most ${schema.maximum}.`,
    );
  }
}

function validateArray(
  schema: ArrayJsonSchema,
  value: unknown,
  context: string,
): void {
  if (!Array.isArray(value)) {
    throw new SchemaValidationError(`${context} must be an array.`);
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    throw new SchemaValidationError(
      `${context} must contain at least ${schema.minItems} items.`,
    );
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    throw new SchemaValidationError(
      `${context} must contain at most ${schema.maxItems} items.`,
    );
  }
  value.forEach((entry, index) =>
    validateJsonValue(schema.items, entry, `${context}[${index}]`),
  );
}

function validateObject(
  schema: ClosedJsonObjectSchema,
  value: unknown,
  context: string,
): void {
  if (!isRecord(value)) {
    throw new SchemaValidationError(`${context} must be an object.`);
  }

  for (const requiredProperty of schema.required ?? []) {
    if (!Object.hasOwn(value, requiredProperty)) {
      throw new SchemaValidationError(
        `${context}.${requiredProperty} is required.`,
      );
    }
  }

  for (const [propertyName, propertyValue] of Object.entries(value)) {
    const propertySchema = schema.properties[propertyName];
    if (!propertySchema) {
      throw new SchemaValidationError(
        `${context} contains unsupported property "${propertyName}".`,
      );
    }
    validateJsonValue(
      propertySchema,
      propertyValue,
      `${context}.${propertyName}`,
    );
  }
}

function jsonValuesEqual(expected: JsonValue, actual: unknown): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
