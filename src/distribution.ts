/** Public distribution links shared by the website and installed app. */
export const repository = "https://github.com/FirethornDigitalAdmin/contour-studio";
export const coffeeUrl = "https://www.buymeacoffee.com/LouisGoldsbrough";
export const releaseTag = "v1.0.0-rc.1";
export const releaseUrl = `${repository}/releases/tag/${releaseTag}`;
export const downloadUrl = (filename: string) => `${repository}/releases/download/${releaseTag}/${filename}`;
