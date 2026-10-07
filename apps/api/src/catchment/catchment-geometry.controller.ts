import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsNumber, Max, Min } from "class-validator";
import type { Request, Response } from "express";
import {
  CatchmentGeometryService,
  type CatchmentDataset,
  type CatchmentLookup,
} from "./catchment-geometry.service";

export class CatchmentLookupDto {
  @ApiProperty({ minimum: -90, maximum: 90, example: 13.1323 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: -59.5626 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng: number;
}

const datasetProperties = {
  datasetId: { type: "string", enum: ["polyclinics"] },
  revision: { type: "string", description: "SHA-256 of the public dataset" },
};

@ApiTags("Catchments")
@Controller("catchments/polyclinics")
export class CatchmentGeometryController {
  constructor(private readonly geometry: CatchmentGeometryService) {}

  @Get()
  @Header("Content-Type", "application/geo+json")
  @Header("Cache-Control", "public, max-age=0, must-revalidate")
  @ApiOperation({ summary: "Download polyclinic catchment boundaries" })
  @ApiOkResponse({
    description:
      "WGS84 GeoJSON. Coordinates are [longitude, latitude]; features contain geographic names and IDs, without service-routing or contact data.",
    content: {
      "application/geo+json": {
        schema: {
          type: "object",
          required: ["type", "datasetId", "revision", "features"],
          properties: {
            ...datasetProperties,
            type: { type: "string", enum: ["FeatureCollection"] },
            features: {
              type: "array",
              items: {
                type: "object",
                required: ["type", "id", "properties", "geometry"],
                properties: {
                  type: { type: "string", enum: ["Feature"] },
                  id: { type: "string" },
                  properties: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string" } },
                  },
                  geometry: {
                    type: "object",
                    description: "GeoJSON Polygon or MultiPolygon",
                    required: ["type", "coordinates"],
                    properties: {
                      type: {
                        type: "string",
                        enum: ["Polygon", "MultiPolygon"],
                      },
                      coordinates: {
                        type: "array",
                        items: { type: "array", items: {} },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 304, description: "The supplied ETag is current" })
  dataset(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): CatchmentDataset | undefined {
    response.setHeader("ETag", this.geometry.etag);
    // Express implements weak/list/wildcard If-None-Match matching and respects
    // Cache-Control: no-cache; keep those HTTP semantics in the platform.
    if (request.fresh) {
      response.status(304);
      return;
    }
    return this.geometry.dataset;
  }

  @Post("lookup")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({
    short: { limit: 30, ttl: 10_000 },
    medium: { limit: 200, ttl: 60_000 },
  })
  @ApiOperation({
    summary: "Locate a point relative to every polyclinic catchment",
    description:
      "Returns geography only. Boundary means within a 1 mm numerical tolerance. Distances use a local planar approximation for Barbados. No parish fallback, coastal reassignment, or serving-clinic selection is applied.",
  })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["datasetId", "revision", "catchments"],
      properties: {
        ...datasetProperties,
        catchments: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "name", "relation", "distanceToBoundaryMeters"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              relation: {
                type: "string",
                enum: ["inside", "boundary", "outside"],
              },
              distanceToBoundaryMeters: { type: "number", minimum: 0 },
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      "Supply only finite numeric lat and lng within their geographic ranges",
  })
  lookup(@Body() point: CatchmentLookupDto): CatchmentLookup {
    return this.geometry.lookup(point);
  }
}
