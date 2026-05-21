import { Module } from "@nestjs/common";
import { RecipeFileLoader } from "./recipe-file-loader.service";

@Module({
  providers: [RecipeFileLoader],
  exports: [RecipeFileLoader],
})
export class RecipeFileLoaderModule {}
