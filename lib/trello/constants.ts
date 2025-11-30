export const CARD_NAME_SPLIT_REGEX = /[-:,\n]/g

export function splitCardName(value: string) {
  return value.split(CARD_NAME_SPLIT_REGEX)
}


