/// <reference types="vite/client" />

declare module '*?raw' {
    const content: string;
    export default content;
}

declare global {
    interface Window {
        CryptoJS: any;
        _localStorage?: Storage;
        _sessionStorage?: Storage;
    }

    declare module '@mui/material/Button' {
        interface ButtonPropsColorOverrides {
            grey: true;
        }
    }
}
declare module '@mui/material/Button' {
    interface ButtonPropsColorOverrides {
        grey: true;
    }
}

export {};
