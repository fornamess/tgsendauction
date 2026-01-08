import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  balance: number; // Рубли
  robux: number; // Накопленные робуксы
  telegramId?: number; // Telegram ID пользователя
  firstName?: string; // Имя из Telegram
  lastName?: string; // Фамилия из Telegram
  photoUrl?: string; // URL фото профиля
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    robux: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    telegramId: {
      type: Number,
      unique: true,
      sparse: true, // Разрешаем null, но если есть - должно быть уникально
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    photoUrl: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Индекс уже создается через unique: true, поэтому убираем дублирование
// UserSchema.index({ username: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
