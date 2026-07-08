/// <reference types="vite/client" />

declare module "*.bib?raw" {
  const content: string;
  export default content;
}
