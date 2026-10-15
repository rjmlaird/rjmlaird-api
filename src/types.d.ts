declare module "*.html" {
  const content: string;
  export default content;
}

interface Env {
  ENVIRONMENT: string;
  SITE_ORIGIN: string;
}
