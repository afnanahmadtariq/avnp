import { SetMetadata } from "@nestjs/common";

import { IS_PUBLIC_ROUTE } from "./auth.constants.js";

export const PublicRoute = () => SetMetadata(IS_PUBLIC_ROUTE, true);
