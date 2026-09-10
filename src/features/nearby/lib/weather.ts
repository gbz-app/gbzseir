/**
 * WMO weather codes (Open-Meteo) -> Turkish label + lucide icon.
 */
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type WeatherInfo = { label: string; icon: LucideIcon };

export function describeWeather(code: number, isDay = true): WeatherInfo {
  switch (code) {
    case 0:
      return { label: isDay ? "Güneşli" : "Açık", icon: isDay ? Sun : Moon };
    case 1:
      return { label: "Az bulutlu", icon: isDay ? CloudSun : CloudMoon };
    case 2:
      return { label: "Parçalı bulutlu", icon: isDay ? CloudSun : CloudMoon };
    case 3:
      return { label: "Kapalı", icon: Cloud };
    case 45:
    case 48:
      return { label: "Sisli", icon: CloudFog };
    case 51:
    case 53:
    case 55:
      return { label: "Çisenti", icon: CloudDrizzle };
    case 56:
    case 57:
      return { label: "Donan çisenti", icon: CloudDrizzle };
    case 61:
      return { label: "Hafif yağmur", icon: CloudRain };
    case 63:
      return { label: "Yağmurlu", icon: CloudRain };
    case 65:
      return { label: "Şiddetli yağmur", icon: CloudRain };
    case 66:
    case 67:
      return { label: "Donan yağmur", icon: CloudRain };
    case 71:
      return { label: "Hafif kar", icon: CloudSnow };
    case 73:
      return { label: "Kar yağışlı", icon: CloudSnow };
    case 75:
      return { label: "Yoğun kar", icon: CloudSnow };
    case 77:
      return { label: "Kar taneleri", icon: Snowflake };
    case 80:
      return { label: "Hafif sağanak", icon: CloudRain };
    case 81:
      return { label: "Sağanak yağış", icon: CloudRain };
    case 82:
      return { label: "Kuvvetli sağanak", icon: CloudRain };
    case 85:
    case 86:
      return { label: "Kar sağanağı", icon: CloudSnow };
    case 95:
      return { label: "Gök gürültülü fırtına", icon: CloudLightning };
    case 96:
    case 99:
      return { label: "Dolu ve fırtına", icon: CloudLightning };
    default:
      return { label: "Hava durumu", icon: Cloud };
  }
}
