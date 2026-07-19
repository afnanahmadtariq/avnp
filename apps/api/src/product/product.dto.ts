import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class AddressDto {
  @IsString()
  @Length(1, 500)
  formattedAddress!: string;
}

export class MoneyDto {
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class InventoryItemDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;

  @IsBoolean()
  @IsOptional()
  specialHandling?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}

export class JobSpecificationDto {
  @IsIn(["moving"])
  vertical!: "moving";

  @Type(() => AddressDto)
  @ValidateNested()
  pickupAddress!: AddressDto;

  @Type(() => AddressDto)
  @ValidateNested()
  dropoffAddress!: AddressDto;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  movingDate!: string;

  @IsInt()
  @Min(0)
  @Max(20)
  bedrooms!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  pickupStairs!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  dropoffStairs!: number;

  @IsBoolean()
  hasElevator!: boolean;

  @IsArray()
  @ArrayMaxSize(250)
  @ArrayMinSize(1)
  @Type(() => InventoryItemDto)
  @ValidateNested({ each: true })
  inventory!: InventoryItemDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsOptional()
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  specialItems?: string[];

  @IsIn(["none", "materials", "partial", "full"])
  packingPreference!: "full" | "materials" | "none" | "partial";

  @IsOptional()
  @Type(() => MoneyDto)
  @ValidateNested()
  budget?: MoneyDto;

  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  notes?: string;
}

export class CreateJobDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @Type(() => JobSpecificationDto)
  @ValidateNested()
  specification?: JobSpecificationDto;
}

export class UpdateDraftDto {
  @IsOptional()
  @Type(() => JobSpecificationDto)
  @ValidateNested()
  specification?: JobSpecificationDto;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;
}

export class ConfirmJobDto {
  @Equals(true, { message: "callingConsent must be accepted" })
  callingConsent!: true;

  @Equals(true, { message: "recordingConsent must be accepted" })
  recordingConsent!: true;
}

export class CreateRunDto {
  @ArrayMaxSize(20, { message: "Select no more than twenty businesses" })
  @ArrayMinSize(3, { message: "Select at least three businesses" })
  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  businessIds!: string[];
}

export class RunEventsQueryDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  after?: number;
}

export class SaveDecisionDto {
  @IsString()
  @Length(1, 128)
  quoteId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1_000)
  note?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  location?: string;

  @IsIn([
    "Asia/Karachi",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
  ])
  @IsOptional()
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  representedAs?: string;
}

export class UpdateSettingsDto {
  @Equals(true, { message: "aiDisclosure must remain enabled" })
  @IsOptional()
  aiDisclosure?: true;

  @IsBoolean()
  @IsOptional()
  emailUpdates?: boolean;

  @IsBoolean()
  @IsOptional()
  callMilestones?: boolean;

  @IsBoolean()
  @IsOptional()
  callbackAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  recordingConsentDefault?: boolean;

  @IsIn([7, 30, 90])
  @IsInt()
  @IsOptional()
  evidenceRetentionDays?: number;

  // Legacy aliases remain accepted while existing local clients upgrade.
  @IsBoolean()
  @IsOptional()
  recordingConsent?: boolean;

  @IsIn([7, 30, 90])
  @IsInt()
  @IsOptional()
  retentionDays?: number;
}
