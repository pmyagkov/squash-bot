// === Chat Type ===
export type ChatType = 'private' | 'group'

// === Base data ===
export interface BaseData {
  userId: number
  chatId: number
  chatType: ChatType
}

// === Callback Base Data ===
interface CallbackBaseData extends BaseData {
  messageId: number
  callbackId: string
}

// === User Info (for join/leave callbacks) ===
interface UserInfo {
  username?: string
  firstName?: string
  lastName?: string
}

// === Callback Types ===
export interface CallbackTypes {
  'event:join': CallbackBaseData & UserInfo
  'event:leave': CallbackBaseData & UserInfo
  'event:add-court': CallbackBaseData
  'event:remove-court': CallbackBaseData
  'event:finalize': CallbackBaseData
  'event:cancel': CallbackBaseData
  'event:undo-cancel': CallbackBaseData
  'event:undo-finalize': CallbackBaseData
  'payment:mark-paid': CallbackBaseData & { eventId: string }
  'payment:undo-mark-paid': CallbackBaseData & { eventId: string }
}

// === Type helpers ===
export type CallbackAction = keyof CallbackTypes
