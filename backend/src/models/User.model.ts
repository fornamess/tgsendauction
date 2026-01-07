import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  balance: number; // Рубли
  robux: number; // Накопленные робуксы
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
  },
  {
    timestamps: true,
  }
);

// Индекс уже создается через unique: true, поэтому убираем дублирование
// UserSchema.index({ username: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
