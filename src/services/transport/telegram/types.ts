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
  'event:add_court': CallbackBaseData
  'event:rm_court': CallbackBaseData
  'event:finalize': CallbackBaseData
  'event:cancel': CallbackBaseData
  'event:restore': CallbackBaseData
}

// === Command Types ===
export interface CommandTypes {
  // Utility commands
  start: BaseData
  help: BaseData
  myid: BaseData & { username?: string; firstName?: string; lastName?: string }
  getchatid: BaseData & { chatTitle?: string }

  // Event subcommands
  'event:list': BaseData
  'event:create': BaseData & { day: string; time: string; courts: number }
  'event:add': BaseData & { day: string; time: string; courts: number }
  'event:announce': BaseData & { eventId: string }
  'event:add-by-scaffold': BaseData & { scaffoldId: string }
  'event:cancel': BaseData & { eventId: string }

  // Scaffold subcommands
  'scaffold:add': BaseData & { day: string; time: string; courts: number }
  'scaffold:list': BaseData
  'scaffold:toggle': BaseData & { scaffoldId: string }
  'scaffold:remove': BaseData & { scaffoldId: string }
  'scaffold:transfer': BaseData & { scaffoldId: string; targetUsername: string }

  // Transfer commands
  'event:transfer': BaseData & { eventId: string; targetUsername: string }
}

// === Type helpers ===
export type CallbackAction = keyof CallbackTypes
export type CommandName = keyof CommandTypes
