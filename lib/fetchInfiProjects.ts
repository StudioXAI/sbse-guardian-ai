export async function fetchInfiProjects() {
  try {
    return [
      {
        name: "People Token",
        contract: "0x3f030ca10775158b07ca6b02c3fc1a08bb7e1f95",
        status: "Listed",
      },
      {
        name: "Gima Trust Token",
        contract: "0x41c1DaDbcF99C307c5fd1E95c6BB9f5E503068daF",
        status: "Active Presale",
      },
      {
        name: "Hiring Plug",
        contract: "0xCE8943Db45a961E9805b82E5ffc2301BB9aED4eF",
        status: "Active Presale",
      },
    ];
  } catch (error) {
    console.error("INFI project fetch failed:", error);
    return [];
  }
}