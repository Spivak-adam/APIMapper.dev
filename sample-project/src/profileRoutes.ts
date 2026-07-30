import {
  Request,
  Response,
  Router
} from "express";

const router = Router();

const supabase: any = {};
const authenticateToken: any = {};

router.get(
  "/profile",
  authenticateToken,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    try {
      const {
        data: userData,
        error: userError
      } = await supabase
        .from("Users")
        .select(`
          first_name,
          last_name,
          email,
          address_id,
          Address!address_id (
            street_address,
            city,
            state,
            zip_code
          )
        `)
        .eq("id", userId)
        .single();

      if (userError || !userData) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      const user = {
        id: userId,
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email
      };

      const address = userData.Address || null;

      let carRows: any[] = [];

      const { data: userCarData } = await supabase
        .from("User_Car")
        .select("carid")
        .eq("userid", userId);

      const carIds = (userCarData || []).map(
        (userCar: any) => userCar.carid
      );

      if (carIds.length > 0) {
        const { data: carsData } = await supabase
          .from("Cars")
          .select(`
            id,
            vin,
            year,
            mileage,
            car_trim,
            engine_size,
            Car_Models!model_id (
              model,
              Car_Makes!make_id (make)
            )
          `)
          .in("id", carIds);

        carRows = (carsData || []).map(
          (car: any) => ({
            id: car.id,
            vin: car.vin,
            year: car.year,
            mileage: car.mileage,
            car_trim: car.car_trim,
            engine_size: car.engine_size,
            carMake:
              car.Car_Models?.Car_Makes?.make,
            carModel: car.Car_Models?.model
          })
        );
      }

      return res.json({
        user,
        address,
        cars: carRows
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error fetching profile."
      });
    }
  }
);

router.get(
  "/users/:id",
  authenticateToken,
  async (req: Request, res: Response) => {
    const userId = req.params.id;
    const includeCars =
      req.query.includeCars === "true";

    return res.json({
      userId,
      includeCars
    });
  }
);

router.post(
  "/users",
  authenticateToken,
  async (req: Request, res: Response) => {
    const {
      firstName,
      lastName,
      email
    } = req.body;

    
    return res.status(201).json({
      id: "generated-id",
      firstName,
      lastName,
      email
    });
  }
);

export default router;