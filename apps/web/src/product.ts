/**
 * The product's name, from the deployment's configuration (PRODUCT_NAME): "Backoffice" is a working name, and names
 * never live in code (CLAUDE.md). Blank when unset, so pages show no name rather than a made-up one.
 */
export const productName = (): string => process.env.PRODUCT_NAME?.trim() ?? '';
