export function extractQueryParams(req: Request) {
    const queryParams: any = new URLSearchParams(req.url.split("?")[1]);
    const allowedQP = ['t', 'r'];
    return allowedQP.map(query => {
        try {
            return +queryParams.get(query)
        }
        catch { }
        return null;
    });
}