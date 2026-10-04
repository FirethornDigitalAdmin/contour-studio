/** Public distribution links shared by the website and installed app. */
export const repository = "https://github.com/FirethornDigitalAdmin/contour-studio";
export const coffeeUrl = "https://www.buymeacoffee.com/LouisGoldsbrough";
export const creator = {
  name: "Louis Goldsbrough",
  twitterHandle: "@imloulou",
  twitterUrl: "https://twitter.com/imloulou",
  portfolioUrl: "https://louisgoldsbrough.co.uk/",
};
export const releaseTag = "v1.0.0-rc.9";
export const releaseUrl = `${repository}/releases/tag/${releaseTag}`;
export const downloadUrl = (filename: string) =>
  ["Contour-Studio-local.zip", "Contour-Studio-source.zip"].includes(filename)
    ? `https://contour-studio.app/downloads/${filename}`
    : `${repository}/releases/download/${releaseTag}/${filename}`;
