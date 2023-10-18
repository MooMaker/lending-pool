import { promises as fs } from "fs";

/**
 * Appends or updates entries in a JSON file.
 * @param filePath - The path to the JSON file.
 * @param newEntry - The entry to be appended or updated.
 */
export async function writeToJSON(
  filePath: string,
  newEntry: Record<string, unknown>,
): Promise<void> {
  let data: Record<string, unknown> = {};

  // Check if the file exists
  try {
    const fileContents = await fs.readFile(filePath, "utf-8");
    data = JSON.parse(fileContents);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error) {
      if (error.code != "ENOENT") {
        // If file doesn't exist, start with an empty object
        throw error;
      }
    } else {
      throw error;
    }
  }

  // Merge the new entry into the existing data
  data = { ...data, ...newEntry };

  // Perform basic JSON validation
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid JSON structure after merging the new entry.");
  }

  // Write back to the file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
