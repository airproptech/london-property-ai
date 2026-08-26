declare module "qrcode-terminal" {
  function generate(input: string, options?: { small?: boolean }, callback?: (qrcode: string) => void): void;
  const _default: { generate: typeof generate };
  export default _default;
  export { generate };
}
