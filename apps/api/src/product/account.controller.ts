import { Body, Controller, Get, Patch } from "@nestjs/common";

// Runtime imports are required for Nest's emitted validation and injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateProfileDto, UpdateSettingsDto } from "./product.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service.js";

@Controller()
export class AccountController {
  constructor(private readonly productService: ProductService) {}

  @Get("profile")
  getProfile(): Promise<unknown> {
    return this.productService.getProfile();
  }

  @Patch("profile")
  updateProfile(@Body() dto: UpdateProfileDto): Promise<unknown> {
    return this.productService.updateProfile(dto);
  }

  @Get("settings")
  getSettings(): Promise<unknown> {
    return this.productService.getSettings();
  }

  @Patch("settings")
  updateSettings(@Body() dto: UpdateSettingsDto): Promise<unknown> {
    return this.productService.updateSettings(dto);
  }

  @Get("account/export")
  exportAccount(): Promise<unknown> {
    return this.productService.exportAccount();
  }
}
