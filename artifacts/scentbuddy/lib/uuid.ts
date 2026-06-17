/**
 * RFC4122 version 4 UUID generated purely in JS.
 *
 * Hermes does not implement crypto.randomUUID, and we deliberately avoid a
 * native crypto dependency (expo-crypto) so this stays shippable via EAS Update
 * without a new native build. Math.random is sufficient here: layer_group_id
 * only needs to be unique per insert to group rows, not cryptographically
 * secure.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
