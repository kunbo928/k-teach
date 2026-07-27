import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

                        
               
                   
              
                    
                       
                       
                         
                  
                      
                         
                            
                         
                               

                      
                                                              
                  
                   
                      
                                              
                                          
                     
                    
                     
 

async function loadSchema(name            )                      {
  const url = new URL(`../schemas/${name}.schema.json`, import.meta.url);
  return JSON.parse(await readFile(fileURLToPath(url), "utf8"))              ;
}

function validateValue(
  schema            ,
  value         ,
  path        ,
)           {
  const errors           = [];
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}must be one of: ${schema.enum.join(", ")}`);
    return errors;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${path}must be a string`);
    else if (schema.minLength && value.length < schema.minLength)
      errors.push(`${path}must not be empty`);
    return errors;
  }
  if (schema.type === "boolean" && typeof value !== "boolean")
    return [`${path}must be a boolean`];
  if (schema.type === "number" && typeof value !== "number")
    return [`${path}must be a number`];
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path}must be an array`];
    if (schema.minItems && value.length < schema.minItems)
      errors.push(`${path}must contain at least ${schema.minItems} item(s)`);
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(...validateValue(schema.items , item, `${path}${index}.`)),
      );
    return errors;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return [`${path || "value "}must be an object`];
    const record = value                           ;
    for (const key of schema.required ?? []) {
      if (!(key in record))
        errors.push(`${path}missing required property: ${key}`);
    }
    for (const [key, item] of Object.entries(record)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema)
        errors.push(...validateValue(propertySchema, item, `${path}${key}: `));
      else if (schema.additionalProperties === false)
        errors.push(`${path}unknown property: ${key}`);
      else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      )
        errors.push(
          ...validateValue(
            schema.additionalProperties,
            item,
            `${path}${key}: `,
          ),
        );
    }
  }
  return errors;
}

export async function validateDocument(
  name            ,
  value         ,
)                    {
  return validateValue(await loadSchema(name), value, "");
}


//# sourceURL=k-teach/src/schema.ts