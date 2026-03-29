export function generate12DigitId() {
    let id = '';
    for (let i = 0; i < 12; i++) {
        id += Math.floor(Math.random() * 10);
    }
    return id;
}
