// The poster comes back without a filetype so we have to guess what the user uploaded.
export function posterSrc(image: string) {
    let type = "image/png"
    if (image.startsWith("/9j/")) {
        type = "image/jpeg"
    } else if (image.startsWith("R0lG")) {
        type = "image/gif"
    } else if (image.startsWith("UklGR")) {
        type = "image/webp"
    }
    return `data:${type};base64,${image}`
}
