import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo modo desarrollo: deja que un celular de la red local cargue el
  // JavaScript del servidor de desarrollo (por defecto Next solo se lo da a
  // `localhost`, y sin él la página se ve pero no responde nada). Si el
  // router le asigna otra IP a la compu, va la nueva acá. No afecta a
  // producción.
  allowedDevOrigins: ["192.168.100.7"],
};

export default nextConfig;
