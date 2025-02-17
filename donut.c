#include <stdio.h>
#include <math.h>
#include <string.h>
#include <windows.h>  // Windows-specific sleep function

#define usleep(x) Sleep((x)/1000)  // Convert microseconds to milliseconds

int main() {
    float A = 0, B = 0;
    int width = 80, height = 24;
    float z[1760];
    char b[1760];

    printf("\x1b[2J"); // Clear screen

    while (1) {
        memset(b, 32, 1760);
        memset(z, 0, 7040);
        for (float j = 0; j < 6.28; j += 0.07) {
            for (float i = 0; i < 6.28; i += 0.02) {
                float c = sin(i), d = cos(j), e = sin(A), f = sin(j),
                      g = cos(A), h = d + 2, D = 1 / (c * h * e + f * g + 5),
                      l = cos(i), m = cos(B), n = sin(B),
                      t = c * h * g - f * e;
                int x = 40 + 30 * D * (l * h * m - t * n),
                    y = 12 + 15 * D * (l * h * n + t * m),
                    o = x + width * y,
                    N = 8 * ((f * e - c * d * g) * m - c * d * e - f * g - l * d * n);
                if (height > y && y > 0 && x > 0 && width > x && D > z[o]) {
                    z[o] = D;
                    b[o] = ".,-~:;=!*#$@"[N > 0 ? N : 0];
                }
            }
        }
        printf("\x1b[H"); // Move cursor to top-left
        for (int k = 0; k < 1760; k++) {
            putchar(k % width ? b[k] : '\n');
        }
        A += 0.04;
        B += 0.02;
        usleep(10000); // Delay for smooth animation
    }
    return 0;
}
