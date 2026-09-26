import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

const contactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);
contactSchema.index({ userId: 1, email: 1 }, { unique: true });

const dealSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    title: { type: String, required: true, trim: true },
    company: { type: String, default: "" },
    value: { type: Number, required: true, min: 0 },
    stage: { type: String, enum: ["New", "Contacted", "Qualified", "Won", "Lost"], default: "New" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const Contact = mongoose.models.Contact ?? mongoose.model("Contact", contactSchema);
export const Deal = mongoose.models.Deal ?? mongoose.model("Deal", dealSchema);