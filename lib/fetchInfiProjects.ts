import axios from "axios";

const API_BASE =
  "https://launchpad.infimultichain.com/users";

export async function fetchInfiProjects() {
  try {
    console.log(
      "Loading INFI projects from official launchpad backend..."
    );

    const [listedRes, upcomingRes] = await Promise.all([
      axios.get(
        `${API_BASE}/getAllListedApplicationForms`,
        {
          timeout: 20000,
        }
      ),
      axios.get(
        `${API_BASE}/getAllUpcommingApplicationForms`,
        {
          timeout: 20000,
        }
      ),
    ]);

    /*
      REAL structure:
      data.data.liquidityApplications
      data.data.presaleApplications
    */

    const listed =
      listedRes?.data?.data?.liquidityApplications || [];

    const listedPresales =
      listedRes?.data?.data?.presaleApplications || [];

    const upcoming =
      upcomingRes?.data?.data?.presaleApplications || [];

    console.log(
      `Listed liquidity projects found: ${listed.length}`
    );

    console.log(
      `Listed presales found: ${listedPresales.length}`
    );

    console.log(
      `Upcoming presales found: ${upcoming.length}`
    );

    const allProjects = [
      ...listed,
      ...listedPresales,
      ...upcoming,
    ];

    const uniqueMap = new Map();

    for (const project of allProjects) {
      if (
        !project?.token_address ||
        !project?.token_name
      ) {
        continue;
      }

      uniqueMap.set(
        project.token_address.toLowerCase(),
        {
          id: project.id,
          name: project.token_name,
          symbol: project.token_symbol,
          contract: project.token_address,
          owner: project.owner_address,
          chain: project.chainName,
          type: project.type,
          liquidity: project.liquidity,
          listed: project.is_listed === 1,
          featured: project.is_feature === 1,
          active: project.is_active === 1,
          website: project.website,
          status: "verified",
          source: "INFI Official Backend",
        }
      );
    }

    const verifiedProjects = Array.from(
      uniqueMap.values()
    );

    console.log(
      `Total verified INFI projects loaded: ${verifiedProjects.length}`
    );

    return verifiedProjects;
  } catch (error) {
    console.error(
      "INFI project loading failed:",
      error
    );

    return [];
  }
}