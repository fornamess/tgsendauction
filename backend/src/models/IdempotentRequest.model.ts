import mongoose, { Schema, Document } from 'mongoose';

export enum IdempotentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export interface IIdempotentRequest extends Document {
  key: string;
  type: string;
  status: IdempotentStatus;
  resultType?: string;
  resultId?: mongoose.Types.ObjectId;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const IdempotentRequestSchema = new Schema<IIdempotentRequest>(
  {
    key: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(IdempotentStatus),
      required: true,
      default: IdempotentStatus.PENDING,
    },
    resultType: {
      type: String,
    },
    resultId: {
      type: Schema.Types.ObjectId,
    },
    errorCode: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Один и тот же ключ для одного типа операции должен быть уникален
IdempotentRequestSchema.index({ key: 1, type: 1 }, { unique: true });

export const IdempotentRequest = mongoose.model<IIdempotentRequest>(
  'IdempotentRequest',
  IdempotentRequestSchema
);

