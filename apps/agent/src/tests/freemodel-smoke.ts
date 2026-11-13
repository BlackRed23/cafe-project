import 'dotenv/config';
import {geminiService} from '../services/model.service';


async function main(){
    const result = await geminiService.getRecommendation(`
        Return a JSON recommendation for this fictional cafe inventory test.

        Ingredient: Coffee beans
        Current stock: 2 kg
        Minimum stock: 5 kg
        Expected demand: 8 kg
        Available supplier ID: supplier-test-001

        Recommend a positive purchase quantity.
        Use supplier-test-001 as recommendedSupplierId.
        Confidence must be between 0 and 1.
        Include reasoning and emailDraft.

        Return only JSON.`

    );
    console.log(JSON.stringify(result, null, 2));
}
main().catch((error) =>{
    console.error('Error during test execution:', error);
    process.exitCode = 1;
})
