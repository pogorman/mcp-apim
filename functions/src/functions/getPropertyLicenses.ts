import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { query } from "../shared/db.js";

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
  const parcelNumber = req.params.parcelNumber;
  if (!parcelNumber) {
    return { status: 400, jsonBody: { error: "parcelNumber is required" } };
  }

  const businessLicenses = await query(
    `SELECT licensenum, licensetype, licensestatus, business_name, legalname,
            rentalcategory, numberofunits, owneroccupied,
            initialissuedate, expirationdate, address
     FROM business_licenses
     WHERE opa_account_num = @parcelNumber
     ORDER BY mostrecentissuedate DESC`,
    { parcelNumber }
  );

  // Also check commercial activity licenses via business name cross-reference
  const comActLicenses = await query(
    `SELECT cal.licensenum, cal.companyname, cal.licensestatus, cal.licensetype,
            cal.revenuecode, cal.issuedate
     FROM commercial_activity_licenses cal
     INNER JOIN business_licenses bl ON UPPER(TRIM(cal.companyname)) = UPPER(TRIM(bl.business_name))
     WHERE bl.opa_account_num = @parcelNumber`,
    { parcelNumber }
  );

  return {
    jsonBody: {
      parcel_number: parcelNumber,
      business_licenses: businessLicenses,
      commercial_activity_licenses: comActLicenses,
    },
  };
  } catch (err: any) {
    return { status: 500, jsonBody: { error: err.message, stack: err.stack } };
  }
}

app.http("getPropertyLicenses", {
  methods: ["GET"],
  authLevel: "function",
  route: "properties/{parcelNumber}/licenses",
  handler,
});
