import { IsString, Length, Matches } from "class-validator";

export class CompleteVoiceIntakeDto {
  @IsString()
  @Length(1, 200)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: "conversationId contains unsupported characters",
  })
  conversationId!: string;
}
